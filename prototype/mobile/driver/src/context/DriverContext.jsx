import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/apiClient'
import { useAuth } from './AuthContext'

const DriverCtx = createContext(null)

export function useDriver() {
  const ctx = useContext(DriverCtx)
  if (!ctx) throw new Error('useDriver must be used inside a DriverProvider')
  return ctx
}

/**
 * Hyderabad city centre. A production driver app would use the device GPS;
 * Expo Go has no background-location module wired up here, so going online
 * reports this fixed origin and telemetry walks outward from it.
 */
export const DEFAULT_ORIGIN = { lat: 17.4399, lng: 78.3813 }

const shortId = (id) => `TRP-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`

/** Adapts a server trip into the shape the driver screens already render. */
function toRequest(trip) {
  if (!trip) return null
  return {
    id: shortId(trip.id),
    serverId: trip.id,
    status: trip.status,
    customer: 'MyDriver customer',
    rating: 4.9,
    pickup: 'Customer pickup point',
    drop: trip.booking_type === 'HOURLY' ? `${trip.hourly_package_hours}-hour hire` : 'Destination',
    skill: trip.required_certification,
    ceiling: trip.speed_ceiling_kmh,
    distanceKm: Number(trip.distance_km ?? trip.estimated_distance_km ?? 0),
    fare: Math.round(trip.fare_amount ?? trip.estimated_fare ?? 0),
    earnings: trip.driver_earnings,
    pickupCoords: trip.pickup,
    dropCoords: trip.drop,
  }
}

/**
 * Owns the driver side of the lifecycle against the real API:
 * availability, incoming offers over the socket, acceptance, the handshake,
 * telemetry streaming and completion.
 */
export function DriverProvider({ children }) {
  const { isAuthenticated } = useAuth()

  const [online, setOnline] = useState(false)
  const [summary, setSummary] = useState(null)
  const [offer, setOffer] = useState(null)
  const [trip, setTrip] = useState(null)
  const [connection, setConnection] = useState('closed')
  const [busy, setBusy] = useState(false)

  const realtimeRef = useRef(null)
  const tripIdRef = useRef(null)

  const refreshSummary = useCallback(async () => {
    try {
      const next = await api.driver.summary()
      setSummary(next)
      setOnline(next.availability !== 'OFFLINE')
      return next
    } catch {
      return null
    }
  }, [])

  /* ── Socket: offers and trip state ───────────────────────────────────── */
  const ensureRealtime = useCallback(async () => {
    if (realtimeRef.current) return realtimeRef.current

    const conn = api.realtime({ onState: setConnection })
    realtimeRef.current = conn

    conn.on('TRIP_OFFER', async (frame) => {
      // The offer arrives before this driver is a participant, so the trip is
      // not yet readable; the frame itself carries what the card needs.
      setOffer({
        id: shortId(frame.trip_id),
        serverId: frame.trip_id,
        expiresAt: frame.expires_at,
        customer: 'MyDriver customer',
        rating: 4.9,
        pickup: 'Customer pickup point',
        drop: 'Destination',
        skill: '—',
        ceiling: 60,
        distanceKm: 0,
        fare: Math.round(frame.fare_estimate ?? 0),
        pickupCoords: frame.pickup,
      })
    })

    conn.on('TRIP_STATE_CHANGED', async (frame) => {
      if (frame.trip_id !== tripIdRef.current) return
      try {
        setTrip(toRequest(await api.trips.get(frame.trip_id)))
      } catch {
        // Refetch can race a cancellation; the next frame corrects it.
      }
    })

    await conn.connect()
    return conn
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      realtimeRef.current?.close()
      realtimeRef.current = null
      return
    }
    void ensureRealtime()
    void refreshSummary()
  }, [isAuthenticated, ensureRealtime, refreshSummary])

  /* ── Resume an in-flight trip after a restart ────────────────────────── */
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const { items } = await api.trips.list({ limit: 5 })
        const active = items.find((t) =>
          ['MATCHED', 'HANDSHAKE_PENDING', 'IN_TRIP'].includes(t.status),
        )
        if (cancelled || !active) return
        tripIdRef.current = active.id
        setTrip(toRequest(active))
        const conn = await ensureRealtime()
        conn.subscribe(active.id)
      } catch {
        // Nothing to resume.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, ensureRealtime])

  /* ── Actions ─────────────────────────────────────────────────────────── */

  /**
   * Dispatch searches a geospatial index, so going online without a position
   * would leave this driver undispatchable. The location is sent with it.
   */
  const goOnline = useCallback(
    async (next, at = DEFAULT_ORIGIN) => {
      setBusy(true)
      try {
        await api.driver.setAvailability(next ? 'ONLINE' : 'OFFLINE', next ? at : undefined)
        setOnline(next)
        await refreshSummary()
        if (next) await ensureRealtime()
      } finally {
        setBusy(false)
      }
    },
    [refreshSummary, ensureRealtime],
  )

  const respondToOffer = useCallback(
    async (accept) => {
      const pending = offer
      if (!pending) return null

      setBusy(true)
      try {
        const accepted = await api.driver.respondToOffer(pending.serverId, accept)
        setOffer(null)
        if (!accept) return null

        tripIdRef.current = accepted.id
        setTrip(toRequest(accepted))
        const conn = await ensureRealtime()
        conn.subscribe(accepted.id)
        return toRequest(accepted)
      } finally {
        setBusy(false)
      }
    },
    [offer, ensureRealtime],
  )

  const submitHandshake = useCallback(async (selfieBase64, otp) => {
    const id = tripIdRef.current
    if (!id) throw new Error('No active trip')
    const res = await api.driver.handshake(id, selfieBase64, otp)
    setTrip(toRequest(await api.trips.get(id)))
    return res
  }, [])

  const sendTelemetry = useCallback((coords, sensors) => {
    const id = tripIdRef.current
    if (!id || !realtimeRef.current) return
    realtimeRef.current.sendDriverTelemetry(id, coords, sensors)
  }, [])

  const completeTrip = useCallback(async () => {
    const id = tripIdRef.current
    if (!id) throw new Error('No active trip')
    const done = await api.driver.complete(id)
    setTrip(toRequest(done))
    await refreshSummary()
    return toRequest(done)
  }, [refreshSummary])

  const clearTrip = useCallback(() => {
    tripIdRef.current = null
    setTrip(null)
    setOffer(null)
  }, [])

  const value = useMemo(
    () => ({
      online,
      busy,
      summary,
      offer,
      trip,
      connection,
      goOnline,
      respondToOffer,
      submitHandshake,
      sendTelemetry,
      completeTrip,
      clearTrip,
      refreshSummary,
    }),
    [
      online, busy, summary, offer, trip, connection,
      goOnline, respondToOffer, submitHandshake, sendTelemetry, completeTrip, clearTrip,
      refreshSummary,
    ],
  )

  return <DriverCtx.Provider value={value}>{children}</DriverCtx.Provider>
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as Location from 'expo-location'
import * as Notifications from 'expo-notifications'
import { AppState } from 'react-native'
import { api } from '../lib/apiClient'
import { useToast } from '../components/Toast'
import { alertNewOffer, isOfferPush, onPushTokenChange, registerForPush } from '../lib/push'
import * as telemetry from '../lib/telemetry'
import { startTracking, stopTracking } from '../lib/tracking'
import { useAuth } from './AuthContext'

const DriverCtx = createContext(null)

export function useDriver() {
  const ctx = useContext(DriverCtx)
  if (!ctx) throw new Error('useDriver must be used inside a DriverProvider')
  return ctx
}

/** Where the driver is right now. Dispatch matches by distance, so this is required to go online. */
async function currentPosition() {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') {
    throw new Error('Allow location access to go online. Trips are matched by distance.')
  }
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
  return { lat: coords.latitude, lng: coords.longitude }
}

/** Statuses in which the car is moving and its location must be streamed. */
const DRIVING = ['IN_TRIP', 'ESCALATED']
/** Statuses in which this driver still has a trip to act on or to see settled. */
const MINE = ['MATCHED', 'HANDSHAKE_PENDING', ...DRIVING, 'COMPLETED']

// Offers last 20 seconds. Polling is the only delivery that is known to work,
// so it stays fast until this device has actually received an offer push;
// after that it is only a safety net.
const OFFER_POLL_MS = 2500
const OFFER_POLL_WITH_PUSH_MS = 10_000

const shortId = (id) => `TRP-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`

/** Adapts a pending offer into the shape the offer card already renders. */
function toOffer(pending) {
  if (!pending) return null
  const km = Number(pending.estimated_distance_km ?? 0)
  return {
    id: shortId(pending.trip_id),
    serverId: pending.trip_id,
    expiresAt: pending.expires_at,
    customer: pending.customer?.name ?? 'Customer',
    pickup: pending.pickup_address ?? 'Pickup point on map',
    drop: pending.drop_address ?? 'Destination on map',
    skill: pending.required_certification,
    ceiling: pending.speed_ceiling_kmh,
    distanceKm: km,
    fare: Math.round(pending.estimated_fare ?? 0),
    earnings: pending.driver_earnings_estimate,
    pickupCoords: pending.pickup,
    dropCoords: pending.drop,
    stops: pending.stops,
    returnStops: pending.return_stops,
    vehicleSpecs: pending.vehicle_specs,
    visionMode: pending.vision_mode,
    flightNumber: pending.flight_number,
    requirement: pending.requirement,
    tripType: pending.trip_type,
  }
}

/** Adapts a server trip into the shape the driver screens already render. */
function toRequest(trip) {
  if (!trip) return null
  return {
    id: shortId(trip.id),
    serverId: trip.id,
    status: trip.status,
    customer: trip.customer_name ?? 'Customer',
    pickup: trip.pickup_address ?? 'Pickup point on map',
    drop:
      trip.drop_address ??
      (trip.booking_type === 'HOURLY' ? `${trip.hourly_package_hours}-hour hire` : 'Destination on map'),
    skill: trip.required_certification,
    ceiling: trip.speed_ceiling_kmh,
    distanceKm: Number(trip.distance_km ?? trip.estimated_distance_km ?? 0),
    durationMin: trip.duration_min ?? null,
    fare: Math.round(trip.fare_amount ?? trip.estimated_fare ?? 0),
    earnings: trip.driver_earnings,
    pickupCoords: trip.pickup,
    dropCoords: trip.drop,
  }
}

/**
 * Owns the driver side of the lifecycle against the real API:
 * availability, incoming offers (push, with polling as the fallback),
 * acceptance, the handshake, location tracking and completion.
 */
export function DriverProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const { toast } = useToast()

  const [online, setOnline] = useState(false)
  const [summary, setSummary] = useState(null)
  const [offer, setOffer] = useState(null)
  const [trip, setTrip] = useState(null)
  const [connection, setConnection] = useState('closed')
  const [busy, setBusy] = useState(false)
  // 'off' | 'background' | 'foreground' | 'denied' — see lib/tracking.js.
  const [tracking, setTracking] = useState('off')
  const [queued, setQueued] = useState(0)
  const [pushStatus, setPushStatus] = useState({ ok: false, reason: 'pending' })
  const [pushDelivers, setPushDelivers] = useState(false)

  const realtimeRef = useRef(null)
  const tripIdRef = useRef(null)
  const alertedOfferRef = useRef(null)

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

  /**
   * Pending offers are fetched here whether the trigger was a push or the
   * poll — see the note on api.driver.offers(). An offer lives 20 seconds.
   */
  const refreshOffers = useCallback(async () => {
    if (tripIdRef.current) return
    try {
      const pending = await api.driver.offers()
      setOffer((current) => {
        const next = pending[0]
        if (!next) return null
        // Don't churn the card (and its countdown) on every poll tick.
        if (current && current.serverId === next.trip_id) return current
        const fresh = toOffer(next)
        // A push has already sounded for this offer; a polled one has not.
        if (alertedOfferRef.current !== next.trip_id) {
          alertedOfferRef.current = next.trip_id
          void alertNewOffer(fresh)
        }
        return fresh
      })
    } catch {
      // A failed poll is not an error worth showing; the next tick retries.
    }
  }, [])

  /**
   * Re-reads the trip from the server. The customer or the Safety Desk can
   * cancel it, and the socket frame that says so is missed whenever the
   * connection is down, so this also runs on reconnect and on return to the app.
   */
  const syncTrip = useCallback(async () => {
    const id = tripIdRef.current
    if (!id) return
    let next
    try {
      next = await api.trips.get(id)
    } catch (err) {
      // No longer this driver's trip (reassigned). Anything else: try again later.
      if (!['TRIP_NOT_FOUND', 'FORBIDDEN_TRIP'].includes(err?.code)) return
      next = null
    }
    if (tripIdRef.current !== id) return
    if (next && MINE.includes(next.status)) {
      setTrip(toRequest(next))
      return
    }
    tripIdRef.current = null
    setTrip(null)
    realtimeRef.current?.unsubscribe(id)
    toast(
      next?.status === 'CANCELLED' ? 'This trip was cancelled. You are back online.' : 'This trip is no longer assigned to you.',
      'warning',
      5000,
    )
    void refreshSummary()
  }, [toast, refreshSummary])

  /* ── Socket: offers and trip state ───────────────────────────────────── */
  const ensureRealtime = useCallback(async () => {
    if (realtimeRef.current) return realtimeRef.current

    const conn = api.realtime({ onState: setConnection })
    realtimeRef.current = conn
    telemetry.setTransport(conn)

    // Kept as a fast path only. In Phase 1 this frame does not actually reach
    // the offered driver: TRIP_OFFER is published to the trip channel, and
    // the gateway only lets trip participants subscribe — trips.driver_id is
    // still NULL while the offer is pending. Polling below is what works.
    conn.on('TRIP_OFFER', () => {
      void refreshOffers()
    })

    conn.on('TRIP_STATE_CHANGED', (frame) => {
      if (frame.trip_id === tripIdRef.current) void syncTrip()
    })

    await conn.connect()
    return conn
  }, [refreshOffers, syncTrip])

  useEffect(() => {
    if (!isAuthenticated) {
      realtimeRef.current?.close()
      realtimeRef.current = null
      return
    }
    void ensureRealtime()
    void refreshSummary()
  }, [isAuthenticated, ensureRealtime, refreshSummary])

  /* ── Push: register the device, and treat an offer push as "look now" ── */
  useEffect(() => {
    if (!isAuthenticated) return undefined
    void registerForPush().then(setPushStatus)
    const offTokenChange = onPushTokenChange()

    const onPush = (notification) => {
      if (!isOfferPush(notification)) return
      const data = notification.request.content.data
      // `local` marks the alert this app raised itself for a polled offer.
      if (!data.local) {
        alertedOfferRef.current = data.trip_id ?? alertedOfferRef.current
        setPushDelivers(true)
      }
      void refreshOffers()
    }
    const received = Notifications.addNotificationReceivedListener(onPush)
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => onPush(r.notification))
    return () => {
      offTokenChange()
      received.remove()
      tapped.remove()
    }
  }, [isAuthenticated, refreshOffers])

  /* ── Offer polling: the fallback, and the only path until push delivers ─ */
  useEffect(() => {
    if (!isAuthenticated || !online || trip) {
      if (!online) setOffer(null)
      return undefined
    }
    void refreshOffers()
    const every = pushDelivers ? OFFER_POLL_WITH_PUSH_MS : OFFER_POLL_MS
    const timer = setInterval(() => void refreshOffers(), every)
    // Timers stop while the app is in the background; catch up on return.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshOffers()
    })
    return () => {
      clearInterval(timer)
      appState.remove()
    }
  }, [isAuthenticated, online, trip, pushDelivers, refreshOffers])

  /* ── Location tracking for the whole drive, screen on or off ──────────── */
  const driving = trip ? DRIVING.includes(trip.status) : false
  const drivingTripId = driving ? trip.serverId : null
  useEffect(() => {
    if (!drivingTripId) return undefined
    let cancelled = false
    startTracking(drivingTripId)
      .then((mode) => !cancelled && setTracking(mode))
      .catch(() => !cancelled && setTracking('denied'))
    return () => {
      cancelled = true
      setTracking('off')
      void stopTracking()
    }
  }, [drivingTripId])

  useEffect(() => telemetry.onQueueChange(({ queued: n }) => setQueued(n)), [])

  // Back online: replay whatever was buffered while the socket was down, and
  // pick up any trip change whose frame was missed.
  useEffect(() => {
    if (connection !== 'open') return
    void telemetry.flush(true)
    void syncTrip()
  }, [connection, syncTrip])

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncTrip()
    })
    return () => appState.remove()
  }, [syncTrip])

  /* ── Expire the offer card when its 20s window closes ─────────────────── */
  useEffect(() => {
    if (!offer?.expiresAt) return undefined
    const ms = new Date(offer.expiresAt).getTime() - Date.now()
    if (ms <= 0) {
      setOffer(null)
      return undefined
    }
    const timer = setTimeout(() => setOffer(null), ms)
    return () => clearTimeout(timer)
  }, [offer])

  /* ── Resume an in-flight trip after a restart ────────────────────────── */
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const { items } = await api.trips.list({ limit: 5 })
        const active = items.find((t) =>
          ['MATCHED', 'HANDSHAKE_PENDING', ...DRIVING].includes(t.status),
        )
        if (cancelled) return
        // The trip ended while the app was closed: the location service from
        // that drive may still be running, and nothing else would stop it.
        if (!active || !DRIVING.includes(active.status)) void stopTracking()
        if (!active) return
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
    async (next) => {
      setBusy(true)
      try {
        const at = next ? await currentPosition() : undefined
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
        setTrip({
          ...toRequest(accepted),
          customer: pending.customer,
          pickup: pending.pickup,
          drop: pending.drop,
        })
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

  /** Only possible before the drive starts; the server refuses it afterwards. */
  const cancelTrip = useCallback(
    async (reason) => {
      const id = tripIdRef.current
      if (!id) throw new Error('No active trip')
      await api.trips.cancel(id, reason)
      tripIdRef.current = null
      setTrip(null)
      realtimeRef.current?.unsubscribe(id)
      await refreshSummary()
    },
    [refreshSummary],
  )

  const sendSos = useCallback(async () => {
    const id = tripIdRef.current
    if (!id) throw new Error('No active trip')
    return api.trips.sos(id, { silent: true })
  }, [])

  const completeTrip = useCallback(async () => {
    const id = tripIdRef.current
    if (!id) throw new Error('No active trip')
    // Send what is still buffered first: the fare uses the distance travelled.
    await telemetry.flush(true)
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
      tracking,
      queued,
      pushStatus,
      goOnline,
      respondToOffer,
      submitHandshake,
      cancelTrip,
      sendSos,
      completeTrip,
      clearTrip,
      refreshSummary,
      refreshOffers,
    }),
    [
      online, busy, summary, offer, trip, connection, tracking, queued, pushStatus,
      goOnline, respondToOffer, submitHandshake, cancelTrip, sendSos, completeTrip, clearTrip,
      refreshSummary, refreshOffers,
    ],
  )

  return <DriverCtx.Provider value={value}>{children}</DriverCtx.Provider>
}

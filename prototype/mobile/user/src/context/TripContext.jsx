import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/apiClient'
import { SKILLS } from '../data/mock'
import { bookingPayloadFor, toVaultRow, toViewTrip } from '../lib/tripView'
import { useAuth } from './AuthContext'

const TripCtx = createContext(null)

export function useTrip() {
  const ctx = useContext(TripCtx)
  if (!ctx) throw new Error('useTrip must be used inside a TripProvider')
  return ctx
}

const DEFAULT_CONFIG = {
  mode: 'location',
  dropId: null,
  packageId: 'h4',
  skillId: 'MD-Standard',
  ceiling: 60,
}

/**
 * Owns the ride lifecycle against the real API.
 *
 * phase: 'browse' -> 'matching' -> 'live' -> 'done' -> 'browse'
 *
 * The server is the source of truth: dispatch, driver acceptance, the handshake
 * and completion all happen server-side, and TRIP_STATE_CHANGED drives phase.
 */
export function TripProvider({ children }) {
  const { isAuthenticated } = useAuth()

  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [phase, setPhase] = useState('browse')
  const [trip, setTrip] = useState(null)
  const [summary, setSummary] = useState(null)
  const [vaultTrips, setVaultTrips] = useState([])
  const [skills, setSkills] = useState(SKILLS)
  const [driverPosition, setDriverPosition] = useState(null)
  const [connection, setConnection] = useState('closed')

  const realtimeRef = useRef(null)
  const tripIdRef = useRef(null)

  /* ── Live rate cards ─────────────────────────────────────────────────── */
  useEffect(() => {
    api.catalogue
      .rateCards()
      .then((cards) => {
        if (!cards?.length) return
        setSkills(
          SKILLS.map((s) => {
            const card = cards.find((c) => c.skill_id === s.id)
            return card ? { ...s, rate: card.per_km_rate, hourlyRate: card.hourly_rate } : s
          }),
        )
      })
      .catch(() => {
        // Offline: keep the bundled rates.
      })
  }, [])

  /* ── History ─────────────────────────────────────────────────────────── */
  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const { items } = await api.trips.list({ limit: 20 })
      setVaultTrips(items.filter((t) => t.status === 'COMPLETED').map(toVaultRow))
    } catch {
      // Non-fatal — the vault simply shows nothing.
    }
  }, [isAuthenticated])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  /* ── Phase from server status ────────────────────────────────────────── */
  const applyTrip = useCallback((next) => {
    setTrip(next)
    if (!next) return setPhase('browse')

    if (next.status === 'REQUESTED' || next.status === 'MATCHED') setPhase('matching')
    else if (next.status === 'HANDSHAKE_PENDING' || next.status === 'IN_TRIP') setPhase('live')
    else if (next.status === 'COMPLETED') setPhase('done')
    else setPhase('browse') // CANCELLED / NO_DRIVERS_FOUND
  }, [])

  const ensureRealtime = useCallback(async () => {
    if (realtimeRef.current) return realtimeRef.current

    const conn = api.realtime({ onState: setConnection })
    realtimeRef.current = conn

    conn.on('TRIP_STATE_CHANGED', async (frame) => {
      if (frame.trip_id !== tripIdRef.current) return
      try {
        applyTrip(await api.trips.get(frame.trip_id))
      } catch {
        // A refetch can lose a race with cancellation; the next frame corrects it.
      }
    })

    conn.on('DRIVER_LOCATION', (frame) => {
      if (frame.trip_id !== tripIdRef.current) return
      setDriverPosition(frame.coords)
    })

    await conn.connect()
    return conn
  }, [applyTrip])

  const watchTrip = useCallback(
    async (tripId) => {
      tripIdRef.current = tripId
      const conn = await ensureRealtime()
      conn.subscribe(tripId)
    },
    [ensureRealtime],
  )

  useEffect(() => {
    if (isAuthenticated) return
    realtimeRef.current?.close()
    realtimeRef.current = null
  }, [isAuthenticated])

  /* ── Actions ─────────────────────────────────────────────────────────── */
  const startMatching = useCallback(
    async (nextConfig) => {
      const active = nextConfig ?? config
      if (nextConfig) setConfig(nextConfig)
      setPhase('matching')

      try {
        const key = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const booked = await api.trips.book(bookingPayloadFor(active), key)
        applyTrip(booked)
        await watchTrip(booked.id)
        return booked
      } catch (err) {
        setPhase('browse')
        throw err
      }
    },
    [config, applyTrip, watchTrip],
  )

  const cancelTrip = useCallback(async (reason = 'Cancelled by customer') => {
    const id = tripIdRef.current
    if (id) {
      try {
        await api.trips.cancel(id, reason)
      } catch {
        // Already terminal server-side; the local reset below is still right.
      }
    }
    tripIdRef.current = null
    setTrip(null)
    setSummary(null)
    setDriverPosition(null)
    setPhase('browse')
  }, [])

  const rateTrip = useCallback(async (rating, comment) => {
    const id = tripIdRef.current
    if (!id) return null
    return api.trips.rate(id, rating, comment)
  }, [])

  const finishTrip = useCallback(async () => {
    tripIdRef.current = null
    setTrip(null)
    setSummary(null)
    setDriverPosition(null)
    setConfig((prev) => ({ ...prev, dropId: null }))
    setPhase('browse')
    await loadHistory()
  }, [loadHistory])

  /* ── Resume an in-flight trip after a restart ────────────────────────── */
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const { items } = await api.trips.list({ limit: 5 })
        const active = items.find((t) =>
          ['REQUESTED', 'MATCHED', 'HANDSHAKE_PENDING', 'IN_TRIP'].includes(t.status),
        )
        if (cancelled || !active) return
        applyTrip(active)
        await watchTrip(active.id)
      } catch {
        // Nothing to resume.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, applyTrip, watchTrip])

  const viewTrip = useMemo(() => toViewTrip(trip, config), [trip, config])

  const value = useMemo(
    () => ({
      config,
      setConfig,
      skills,
      phase,
      trip: viewTrip,
      rawTrip: trip,
      summary,
      setSummary,
      driverPosition,
      connection,
      vaultTrips,
      startMatching,
      cancelTrip,
      rateTrip,
      finishTrip,
      reloadHistory: loadHistory,
    }),
    [
      config, skills, phase, viewTrip, trip, summary, driverPosition, connection, vaultTrips,
      startMatching, cancelTrip, rateTrip, finishTrip, loadHistory,
    ],
  )

  return <TripCtx.Provider value={value}>{children}</TripCtx.Provider>
}

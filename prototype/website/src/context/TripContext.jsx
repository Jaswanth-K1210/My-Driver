import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TripContext } from './tripStore.js'
import { api } from '../lib/apiClient.js'
import { SKILLS } from '../data/mock.js'
import { DEFAULT_CONFIG, bookingPayloadFor } from '../lib/booking.js'
import { toVaultRow, toViewTrip } from '../lib/tripView.js'
import { useAuth } from './authStore.js'

/**
 * Owns the whole ride lifecycle against the real API.
 *
 * phase: 'idle' -> 'matching' -> 'live' -> 'complete' -> 'idle'
 *
 * The server is the source of truth for state. We open one WebSocket and let
 * TRIP_STATE_CHANGED drive the phase, rather than guessing locally: dispatch,
 * driver acceptance and completion all happen server-side.
 */
export function TripProvider({ children }) {
  const { isAuthenticated } = useAuth()

  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [phase, setPhase] = useState('idle')
  const [trip, setTrip] = useState(null)
  const [summary, setSummary] = useState(null)
  const [pastTrips, setPastTrips] = useState([])
  const [skills, setSkills] = useState(SKILLS)
  const [driverPosition, setDriverPosition] = useState(null)
  const [connection, setConnection] = useState('closed')
  const [error, setError] = useState(null)

  const realtimeRef = useRef(null)
  const tripIdRef = useRef(null)

  /* ── Rate cards: real prices instead of hardcoded ones ───────────────── */
  useEffect(() => {
    let cancelled = false
    api.catalogue
      .rateCards()
      .then((cards) => {
        if (cancelled || !cards?.length) return
        // Keep the marketing copy from mock.js, take the numbers from the API.
        setSkills(
          SKILLS.map((s) => {
            const card = cards.find((c) => c.skill_id === s.id)
            return card ? { ...s, rate: card.per_km_rate, hourlyRate: card.hourly_rate } : s
          }),
        )
      })
      .catch(() => {
        // Offline: fall back to the bundled rates and carry on.
      })
    return () => {
      cancelled = true
    }
  }, [])

  /* ── Trip history ────────────────────────────────────────────────────── */
  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const { items } = await api.trips.list({ limit: 20 })
      setPastTrips(items.filter((t) => t.status === 'COMPLETED').map(toVaultRow))
    } catch {
      // Non-fatal: the vault simply shows nothing.
    }
  }, [isAuthenticated])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  /* ── Realtime ────────────────────────────────────────────────────────── */
  const applyTrip = useCallback((next) => {
    setTrip(next)
    if (!next) return setPhase('idle')

    if (next.status === 'REQUESTED' || next.status === 'MATCHED') setPhase('matching')
    else if (next.status === 'HANDSHAKE_PENDING' || next.status === 'IN_TRIP') setPhase('live')
    else if (next.status === 'COMPLETED') setPhase('complete')
    else setPhase('idle') // CANCELLED / NO_DRIVERS_FOUND
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
        // The refetch can lose a race with cancellation; the next frame fixes it.
      }
    })

    conn.on('DRIVER_LOCATION', (frame) => {
      if (frame.trip_id !== tripIdRef.current) return
      setDriverPosition(frame.coords)
    })

    await conn.connect()
    return conn
  }, [applyTrip])

  useEffect(() => {
    if (isAuthenticated) return undefined
    realtimeRef.current?.close()
    realtimeRef.current = null
    return undefined
  }, [isAuthenticated])

  const watchTrip = useCallback(
    async (tripId) => {
      tripIdRef.current = tripId
      const conn = await ensureRealtime()
      conn.subscribe(tripId)
    },
    [ensureRealtime],
  )

  /* ── Actions ─────────────────────────────────────────────────────────── */

  /** Books for real, then follows the server through dispatch. */
  const startMatching = useCallback(
    async (nextConfig) => {
      const active = nextConfig ?? config
      if (nextConfig) setConfig(nextConfig)
      setError(null)
      setPhase('matching')

      try {
        const payload = bookingPayloadFor(active, skills)
        // Idempotency key: a retried booking must not create two trips.
        const key = `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const booked = await api.trips.book(payload, key)

        applyTrip(booked)
        await watchTrip(booked.id)
        return booked
      } catch (err) {
        setError(err)
        setPhase('idle')
        throw err
      }
    },
    [config, skills, applyTrip, watchTrip],
  )

  const cancelTrip = useCallback(
    async (reason = 'Cancelled by customer') => {
      const id = tripIdRef.current
      if (id) {
        try {
          await api.trips.cancel(id, reason)
        } catch {
          // Already terminal server-side; local reset below is still correct.
        }
      }
      tripIdRef.current = null
      setTrip(null)
      setSummary(null)
      setDriverPosition(null)
      setPhase('idle')
    },
    [],
  )

  const completeTrip = useCallback((result) => {
    setSummary(result)
    setPhase('complete')
  }, [])

  const rateTrip = useCallback(async (rating, comment) => {
    const id = tripIdRef.current
    if (!id) return null
    return api.trips.rate(id, rating, comment)
  }, [])

  /** Called after the completion screen is dismissed. */
  const saveToVault = useCallback(async () => {
    tripIdRef.current = null
    setTrip(null)
    setSummary(null)
    setDriverPosition(null)
    setPhase('idle')
    await loadHistory()
  }, [loadHistory])

  /** Reattach to an in-flight trip after a page reload. */
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

  // Screens render the adapted shape; `rawTrip` stays available for anything
  // that needs the untouched server payload.
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
      driverPosition,
      connection,
      error,
      vaultTrips: pastTrips,
      startMatching,
      completeTrip,
      cancelTrip,
      rateTrip,
      saveToVault,
      reloadHistory: loadHistory,
      hasActiveTrip: phase === 'live' || phase === 'matching',
    }),
    [
      config, skills, phase, viewTrip, trip, summary, driverPosition, connection, error,
      pastTrips, startMatching, completeTrip, cancelTrip, rateTrip, saveToVault, loadHistory,
    ],
  )

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

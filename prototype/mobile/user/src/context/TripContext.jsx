import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import * as Location from 'expo-location'
import * as WebBrowser from 'expo-web-browser'
import { api } from '../lib/apiClient'
import { bookingPayloadFor, carDetailsFrom, DEFAULT_CONFIG, getRecommendedSkillId } from '../lib/booking'
import { onPushTokenChange, onTripPush, registerForPush, tripIdFrom } from '../lib/push'
import { skillsFromRateCards } from '../lib/skills'
import { colors } from '../theme/tokens'
import { ACTIVE_STATUSES, toHistoryRow, toViewTrip } from '../lib/tripView'
import { useAuth } from './AuthContext'

const TripCtx = createContext(null)

export function useTrip() {
  const ctx = useContext(TripCtx)
  if (!ctx) throw new Error('useTrip must be used inside a TripProvider')
  return ctx
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
  // Unpaid trips wait in REQUESTED; screens show the payment step meanwhile.
  const [payment, setPayment] = useState(null)
  const [trip, setTrip] = useState(null)
  const [summary, setSummary] = useState(null)
  // Trip history, newest first, a page at a time.
  const [history, setHistory] = useState([])
  const [historyStatus, setHistoryStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [historyCursor, setHistoryCursor] = useState(null)
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false)
  // Something the customer must be told that no screen of its own carries:
  // a trip cancelled by the driver, or no driver found.
  const [notice, setNotice] = useState(null)
  // Tiers and prices come only from the server; there is no bundled copy.
  const [skills, setSkills] = useState([])
  const [skillsStatus, setSkillsStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [driverPosition, setDriverPosition] = useState(null)
  // The customer's saved cars: null until first loaded.
  const [garage, setGarage] = useState(null)
  const [garageStatus, setGarageStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [connection, setConnection] = useState('closed')

  const realtimeRef = useRef(null)
  const tripIdRef = useRef(null)
  // True while this phone is cancelling, so its own cancellation is not
  // announced back to it as news.
  const cancellingRef = useRef(false)

  /* ── Live rate cards ─────────────────────────────────────────────────── */
  const loadSkills = useCallback(async () => {
    try {
      const next = skillsFromRateCards(await api.catalogue.rateCards())
      if (!next.length) throw new Error('No driver tiers are available')
      setSkills(next)
      setSkillsStatus('ready')
      // A tier can be switched off in the console; do not leave it selected.
      setConfig((prev) => {
        if (next.some((s) => s.id === prev.skillId)) return prev
        const recommended = getRecommendedSkillId(prev.carDetails, prev.requirement)
        return { ...prev, skillId: (next.find((s) => s.id === recommended) ?? next[0]).id }
      })
    } catch {
      // Prices already on screen stay; with none, the picker offers a retry.
      setSkillsStatus((prev) => (prev === 'ready' ? prev : 'error'))
    }
  }, [])

  // Prices can change in the console at any time, so read them again whenever
  // the app comes back to the foreground.
  useEffect(() => {
    void loadSkills()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadSkills()
    })
    return () => sub.remove()
  }, [loadSkills])

  const reloadSkills = useCallback(() => {
    setSkillsStatus((prev) => (prev === 'ready' ? prev : 'loading'))
    return loadSkills()
  }, [loadSkills])

  /* ── Garage ──────────────────────────────────────────────────────────── */
  const reloadGarage = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const cars = await api.me.vehicles.list()
      setGarage(cars)
      setGarageStatus('ready')
      setConfig((prev) => {
        const chosen = prev.carDetails?.savedVehicleId
        // The chosen car was deleted in Profile: stop booking with it.
        if (chosen && !cars.some((c) => c.id === chosen)) {
          return { ...prev, carDetails: DEFAULT_CONFIG.carDetails }
        }
        // Nothing chosen yet: start from the default car.
        const preferred = cars.find((c) => c.is_default)
        if (!chosen && !prev.carDetails?.company && preferred) {
          const carDetails = carDetailsFrom(preferred)
          return { ...prev, carDetails, skillId: getRecommendedSkillId(carDetails, prev.requirement) }
        }
        return prev
      })
    } catch {
      setGarageStatus('error')
    }
  }, [isAuthenticated])

  useEffect(() => {
    void reloadGarage()
  }, [reloadGarage])

  /* ── History ─────────────────────────────────────────────────────────── */
  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const { items, next_cursor } = await api.trips.list({ limit: 20 })
      setHistory(items.map(toHistoryRow))
      setHistoryCursor(next_cursor ?? null)
      setHistoryStatus('ready')
    } catch {
      // Trips already listed stay on screen; with none, the screen offers a retry.
      setHistoryStatus((prev) => (prev === 'ready' ? prev : 'error'))
      throw new Error('Could not load your trips')
    }
  }, [isAuthenticated])

  const loadMoreHistory = useCallback(async () => {
    if (!historyCursor || historyLoadingMore) return
    setHistoryLoadingMore(true)
    try {
      const { items, next_cursor } = await api.trips.list({ limit: 20, cursor: historyCursor })
      setHistory((prev) => {
        const seen = new Set(prev.map((t) => t.serverId))
        return [...prev, ...items.map(toHistoryRow).filter((t) => !seen.has(t.serverId))]
      })
      setHistoryCursor(next_cursor ?? null)
    } finally {
      setHistoryLoadingMore(false)
    }
  }, [historyCursor, historyLoadingMore])

  useEffect(() => {
    loadHistory().catch(() => undefined)
  }, [loadHistory])

  /* ── Phase from server status ────────────────────────────────────────── */
  const applyTrip = useCallback((next) => {
    // The trip being followed has ended without completing. Say so, unless
    // the customer cancelled it on this phone.
    if (next && ['CANCELLED', 'NO_DRIVERS_FOUND'].includes(next.status)) {
      if (tripIdRef.current === next.id && !cancellingRef.current) {
        setNotice(
          next.status === 'NO_DRIVERS_FOUND'
            ? {
                title: 'No driver available',
                message: 'We could not find a driver for this trip. The amount held has been released. Please try again in a few minutes.',
              }
            : {
                title: 'Trip cancelled',
                message: 'This trip was cancelled. The amount held has been released.',
              },
        )
      }
      if (tripIdRef.current === next.id) tripIdRef.current = null
      setTrip(null)
      setPayment(null)
      setDriverPosition(null)
      return setPhase('browse')
    }

    setTrip(next)
    if (!next) return setPhase('browse')

    if (next.status === 'REQUESTED' || next.status === 'MATCHED') setPhase('matching')
    // ESCALATED is a trip still being driven with the Safety Desk involved:
    // the live screen (map, SOS, guardian link) must stay up.
    else if (['HANDSHAKE_PENDING', 'IN_TRIP', 'ESCALATED'].includes(next.status)) setPhase('live')
    else if (next.status === 'COMPLETED') setPhase('done')
    else setPhase('browse') // CANCELLED / NO_DRIVERS_FOUND
  }, [])

  const ensureRealtime = useCallback(async () => {
    if (realtimeRef.current) return realtimeRef.current

    const conn = api.realtime({
      onState: (state) => {
        setConnection(state)
        // Frames sent while the socket was down are gone: read the trip again.
        if (state === 'open' && tripIdRef.current) {
          api.trips.get(tripIdRef.current).then(applyTrip).catch(() => undefined)
        }
      },
    })
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

  /* ── Customer position during the drive ──────────────────────────────── */
  // The integrity engine compares it with the driver's to tell whether the
  // customer is still in the car. Only while the trip runs and the app is
  // open; declining the permission just leaves that check off.
  const sharingTripId = trip && ['IN_TRIP', 'ESCALATED'].includes(trip.status) ? trip.id : null
  useEffect(() => {
    if (!sharingTripId) return undefined
    let watch = null
    let stopped = false
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted' || stopped) return
        watch = await Location.watchPositionAsync(
          // The server marks a stream stale after 30 s; every 5 s is plenty.
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 0 },
          ({ coords, mocked }) => {
            realtimeRef.current?.sendCustomerTelemetry(sharingTripId, {
              lat: coords.latitude,
              lng: coords.longitude,
              ...(coords.accuracy != null ? { accuracy: Math.round(coords.accuracy) } : {}),
              ...(mocked ? { mocked: true } : {}),
            })
          },
        )
        if (stopped) watch.remove()
      } catch {
        // No location services on this device: the check stays off.
      }
    })()
    return () => {
      stopped = true
      watch?.remove()
    }
  }, [sharingTripId])

  /* ── Actions ─────────────────────────────────────────────────────────── */
  const startMatching = useCallback(
    async (nextConfig) => {
      const active = nextConfig ?? config
      if (nextConfig) setConfig(nextConfig)
      setPhase('matching')

      try {
        const key = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const booked = await api.trips.book(bookingPayloadFor(active, skills), key)
        setPayment(booked.payment ?? null)
        applyTrip(booked)
        await watchTrip(booked.id)
        return booked
      } catch (err) {
        setPhase('browse')
        throw err
      }
    },
    [config, skills, applyTrip, watchTrip],
  )

  /**
   * Cancels on the server first. The trip leaves the screen only once the
   * server agrees it is over: dropping it locally on a failed request would
   * hide a trip that is still being dispatched or driven.
   */
  const cancelTrip = useCallback(
    async (reason = 'Cancelled by customer') => {
      const id = tripIdRef.current
      if (id) {
        cancellingRef.current = true
        try {
          await api.trips.cancel(id, reason)
        } catch (err) {
          let current = null
          try {
            current = await api.trips.get(id)
          } catch {
            // Offline: nothing is known about the trip, so nothing changes.
          }
          if (!current || ACTIVE_STATUSES.includes(current.status)) {
            if (current) applyTrip(current)
            const started = current && ['IN_TRIP', 'ESCALATED'].includes(current.status)
            throw new Error(
              started
                ? 'This trip has already started and cannot be cancelled here. Use SOS if you need help.'
                : (err?.message ?? 'Could not cancel. Check your connection and try again.'),
            )
          }
          if (current.status === 'COMPLETED') return applyTrip(current)
          // Already cancelled on the server: fall through to the reset.
        } finally {
          cancellingRef.current = false
        }
      }
      tripIdRef.current = null
      setTrip(null)
      setPayment(null)
      setSummary(null)
      setDriverPosition(null)
      setPhase('browse')
      loadHistory().catch(() => undefined)
    },
    [applyTrip, loadHistory],
  )

  const rateTrip = useCallback(async (rating, comment) => {
    const id = tripIdRef.current
    if (!id) return null
    return api.trips.rate(id, rating, comment)
  }, [])

  const finishTrip = useCallback(async () => {
    tripIdRef.current = null
    setTrip(null)
    setPayment(null)
    setSummary(null)
    setDriverPosition(null)
    setConfig((prev) => ({ ...prev, dropId: null }))
    setPhase('browse')
    await loadHistory().catch(() => undefined)
  }, [loadHistory])

  /* ── Resume an in-flight trip after a restart ────────────────────────── */
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const { items } = await api.trips.list({ limit: 5 })
        const active = items.find((t) => ACTIVE_STATUSES.includes(t.status))
        if (cancelled || !active) return
        if (active.status === 'REQUESTED') {
          setPayment((await api.payments.forTrip(active.id).catch(() => null))?.payment ?? null)
        }
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

  // Back in the foreground: the socket was suspended, so read the trip again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !tripIdRef.current) return
      api.trips.get(tripIdRef.current).then(applyTrip).catch(() => undefined)
    })
    return () => sub.remove()
  }, [applyTrip])

  /* ── Push notifications ──────────────────────────────────────────────── */
  // Register this phone once signed in, and keep the token current.
  useEffect(() => {
    if (!isAuthenticated) return undefined
    void registerForPush()
    return onPushTokenChange()
  }, [isAuthenticated])

  // A push means the server moved a trip. Read it again rather than trust the
  // WebSocket, which is closed while the app is in the background. This also
  // covers a tap on a notification: the app opens on the trip's current screen.
  useEffect(() => {
    if (!isAuthenticated) return undefined
    return onTripPush(async (notification) => {
      const id = tripIdFrom(notification)
      if (!id) return
      // An older trip's notification must not replace the one in progress.
      if (tripIdRef.current && tripIdRef.current !== id) return
      try {
        const next = await api.trips.get(id)
        // A trip this phone is no longer following (already rated and closed,
        // or cancelled) only refreshes the history.
        if (!ACTIVE_STATUSES.includes(next.status) && tripIdRef.current !== id) {
          loadHistory().catch(() => undefined)
          return
        }
        applyTrip(next)
        await watchTrip(id)
      } catch {
        // Offline: the resume check on the next launch catches up.
      }
    })
  }, [isAuthenticated, applyTrip, watchTrip, loadHistory])

  const awaitingPayment =
    phase === 'matching' && trip?.status === 'REQUESTED' && ['CREATED', 'FAILED'].includes(payment?.status)

  // Checkout reports to the server, not the app, so poll until the hold lands.
  useEffect(() => {
    if (!awaitingPayment) return undefined
    const tripId = trip.id
    const timer = setInterval(async () => {
      try {
        const { payment: next } = await api.payments.forTrip(tripId)
        if (next) setPayment(next)
        if (next?.status === 'AUTHORIZED') applyTrip(await api.trips.get(tripId))
      } catch {
        // Transient; the next tick retries.
      }
    }, 2500)
    return () => clearInterval(timer)
  }, [awaitingPayment, trip?.id, applyTrip])

  const openCheckout = useCallback(async () => {
    if (!payment) return
    await WebBrowser.openBrowserAsync(api.payments.checkoutUrl(payment), {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: colors.red,
    })
    // The sheet closed: check straight away rather than waiting for the next tick.
    try {
      const { payment: next } = await api.payments.forTrip(payment.trip_id)
      if (next) setPayment(next)
      if (next?.status === 'AUTHORIZED') applyTrip(await api.trips.get(payment.trip_id))
    } catch {
      // The poll will catch up.
    }
  }, [payment, applyTrip])

  const clearNotice = useCallback(() => setNotice(null), [])

  const viewTrip = useMemo(() => toViewTrip(trip), [trip])

  const value = useMemo(
    () => ({
      config,
      setConfig,
      skills,
      skillsStatus,
      reloadSkills,
      garage,
      garageStatus,
      reloadGarage,
      phase: awaitingPayment ? 'payment' : phase,
      payment,
      openCheckout,
      trip: viewTrip,
      rawTrip: trip,
      summary,
      setSummary,
      driverPosition,
      connection,
      history,
      historyStatus,
      hasMoreHistory: Boolean(historyCursor),
      historyLoadingMore,
      loadMoreHistory,
      notice,
      clearNotice,
      startMatching,
      cancelTrip,
      rateTrip,
      finishTrip,
      reloadHistory: loadHistory,
    }),
    [
      config, skills, skillsStatus, reloadSkills, garage, garageStatus, reloadGarage, phase, awaitingPayment, payment, openCheckout, viewTrip, trip, summary, driverPosition, connection, history, historyStatus, historyCursor, historyLoadingMore,
      loadMoreHistory, notice, clearNotice,
      startMatching, cancelTrip, rateTrip, finishTrip, loadHistory,
    ],
  )

  return <TripCtx.Provider value={value}>{children}</TripCtx.Provider>
}

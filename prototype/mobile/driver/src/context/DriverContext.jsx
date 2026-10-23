import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as Location from 'expo-location'
import { AppState } from 'react-native'
import { api, secureStorage } from '../lib/apiClient'
import { useToast } from '../components/Toast'
import { alertNewOffer, isOfferPush, onOfferPush, onPushTokenChange, registerForPush } from '../lib/push'
import {
  classifyApiError,
  createOnboardingController,
  createSingleFlight,
  isTrustedInProgressTrip,
} from '../lib/onboardingGate'
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
function toRequest(trip, prevInspected = undefined) {
  if (!trip) return null
  const serverId = trip.serverId ?? trip.id
  return {
    id: shortId(serverId),
    serverId,
    driverId: trip.driver_id ?? trip.driverId ?? null,
    status: trip.status,
    customer: trip.customer_name ?? trip.customer ?? 'Customer',
    pickup: trip.pickup_address ?? trip.pickup ?? 'Pickup point on map',
    drop:
      trip.drop_address ??
      trip.drop ??
      (trip.booking_type === 'HOURLY' ? `${trip.hourly_package_hours}-hour hire` : 'Destination on map'),
    skill: trip.required_certification ?? trip.skill,
    ceiling: trip.speed_ceiling_kmh ?? trip.ceiling,
    distanceKm: Number(trip.distance_km ?? trip.estimated_distance_km ?? trip.distanceKm ?? 0),
    durationMin: trip.duration_min ?? trip.durationMin ?? null,
    // When the handshake started the trip (server clock), for the drive timer.
    startedAt: trip.started_at ? Date.parse(trip.started_at) : (trip.startedAt ?? null),
    fare: Math.round(trip.fare_amount ?? trip.estimated_fare ?? trip.fare ?? 0),
    platformFee: trip.platform_fee ?? trip.platformFee ?? null,
    nightFee: trip.night_fee ?? trip.nightFee ?? null,
    earnings: trip.driver_earnings ?? trip.earnings,
    requirement: trip.requirement ?? null,
    tripType: trip.trip_type ?? trip.tripType ?? null,
    pickupCoords: trip.pickupCoords ?? trip.pickup,
    dropCoords: trip.dropCoords ?? trip.drop,
    inspected: prevInspected !== undefined ? prevInspected : (trip.inspected ?? null),
  }
}

/**
 * Owns the driver side of the lifecycle against the real API:
 * onboarding validation + active-trip continuity, availability, incoming offers
 * (push, with polling as the fallback), acceptance, the handshake, location
 * tracking and completion.
 */
export function DriverProvider({ children }) {
  const { user, isAuthenticated, signOut, refreshMe } = useAuth()
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
  // Socket handlers are bound once, so they read the latest trip from here.
  const tripRef = useRef(null)
  tripRef.current = trip
  const alertedOfferRef = useRef(null)

  const controllerRef = useRef(null)
  if (!controllerRef.current) {
    controllerRef.current = createOnboardingController({
      api,
      storage: secureStorage,
      onAuthInvalid: () => signOut(),
    })
  }
  const controller = controllerRef.current

  const [onboardingGate, setOnboardingGate] = useState(() => controller.getSnapshot())

  useEffect(() => controller.subscribe(setOnboardingGate), [controller])

  const reloadOnboarding = useCallback(() => controller.validate(), [controller])

  const updateTripInspected = useCallback(
    async (inspected) => {
      setTrip((prev) => {
        if (!prev) return prev
        const next = { ...prev, inspected }
        void controller.setActiveTrip(next, { inspected })
        return next
      })
    },
    [controller],
  )

  const refreshSummary = useCallback(async () => {
    try {
      const next = await api.driver.summary()
      const isProfileReady =
        typeof next.profile_complete === 'boolean'
          ? next.profile_complete
          : Boolean(
              (next.full_name || '').trim() &&
                (next.vehicle_model || '').trim() &&
                (next.vehicle_plate || '').trim(),
            )
      if (!isProfileReady && next.availability === 'ONLINE') {
        await api.driver.setAvailability('OFFLINE').catch(() => undefined)
        const updated = { ...next, availability: 'OFFLINE' }
        setSummary(updated)
        setOnline(false)
        setOffer(null)
        return updated
      }
      setSummary(next)
      const gate = controller.getSnapshot()
      setOnline(gate.freshlyApproved && isProfileReady && next.availability !== 'OFFLINE')
      return next
    } catch (err) {
      await controller.handleOperationError(err)
      return null
    }
  }, [controller])

  /**
   * Pending offers are fetched here whether the trigger was a push or the
   * poll — see the note on api.driver.offers(). An offer lives 20 seconds.
   * Blocked whenever fresh approval validation has not succeeded.
   */
  const refreshOffers = useCallback(async () => {
    if (tripIdRef.current) return
    const gate = controller.getSnapshot()
    if (!gate.canStartOrAcceptNewRide) {
      setOffer(null)
      return
    }
    try {
      const pending = await api.driver.offers()
      if (!controller.getSnapshot().canStartOrAcceptNewRide) {
        setOffer(null)
        return
      }
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
    } catch (err) {
      // The server took this driver offline (missed offers, or ops): match it.
      if (err?.code === 'DRIVER_OFFLINE') {
        setOffer(null)
        setOnline(false)
        toast('You are offline after missing trip requests. Go online when you are ready.', 'warning', 6000)
        return
      }
      const kind = await controller.handleOperationError(err)
      if (kind === 'FORBIDDEN' || kind === 'AUTH_INVALID') {
        setOffer(null)
        setOnline(false)
      }
    }
  }, [controller, toast])

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
      const kind = classifyApiError(err)
      if (kind === 'AUTH_INVALID') {
        await controller.handleOperationError(err)
        return
      }
      // No longer this driver's trip (reassigned). Anything else (network error):
      // preserve the ongoing trip state and try again later.
      if (!['TRIP_NOT_FOUND', 'FORBIDDEN_TRIP'].includes(err?.code)) return
      next = null
    }
    if (tripIdRef.current !== id) return
    if (next && MINE.includes(next.status) && next.driver_id === user?.id) {
      const adapted = toRequest(next, tripRef.current?.inspected)
      setTrip(adapted)
      const prevGate = controller.getSnapshot()
      await controller.setActiveTrip(adapted)
      if (prevGate.continuityActive || controller.getSnapshot().revalidationRequired) {
        void controller.validate()
      }
      return
    }
    tripIdRef.current = null
    setTrip(null)
    await controller.setActiveTrip(null)
    void controller.validate()
    realtimeRef.current?.unsubscribe(id)
    toast(
      next?.status === 'CANCELLED' ? 'This trip was cancelled.' : 'This trip is no longer assigned to you.',
      'warning',
      5000,
    )
    void refreshSummary()
  }, [toast, refreshSummary, controller, user?.id])

  /* ── Socket: offers and trip state ───────────────────────────────────── */
  const ensureRealtime = useCallback(async () => {
    if (realtimeRef.current) return realtimeRef.current

    const conn = api.realtime({ onState: setConnection })
    realtimeRef.current = conn
    telemetry.setTransport(conn)

    conn.on('TRIP_OFFER', () => {
      void refreshOffers()
    })

    conn.on('TRIP_STATE_CHANGED', (frame) => {
      if (frame.trip_id === tripIdRef.current) void syncTrip()
    })

    await conn.connect()
    return conn
  }, [refreshOffers, syncTrip])

  /* ── Hydrate onboarding + active-trip continuity & resume after restart ─ */
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      realtimeRef.current?.close()
      realtimeRef.current = null
      tripIdRef.current = null
      setTrip(null)
      setOffer(null)
      setOnline(false)
      void controller.clearAllForLogout()
      return undefined
    }

    let cancelled = false
    ;(async () => {
      // 1. Hydrate stored historical approval & active IN_TRIP/ESCALATED snapshot
      //    bound to `user.id` before network requests complete.
      const hydrated = await controller.hydrateForUser(user.id)
      if (cancelled) return

      if (hydrated.activeTrip && isTrustedInProgressTrip(hydrated.activeTrip, user.id)) {
        tripIdRef.current = hydrated.activeTrip.serverId
        setTrip(hydrated.activeTrip)
      }

      // 2. Reconcile active trip with server and validate onboarding in parallel.
      const tripCheck = (async () => {
        try {
          const { items } = await api.trips.list({ limit: 5 })
          if (cancelled) return
          const active = items.find(
            (t) =>
              t.driver_id === user.id &&
              ['MATCHED', 'HANDSHAKE_PENDING', ...DRIVING].includes(t.status),
          )
          if (!active || !DRIVING.includes(active.status)) void stopTracking()
          if (!active) {
            tripIdRef.current = null
            setTrip(null)
            await controller.setActiveTrip(null)
            return
          }
          const adapted = toRequest(
            active,
            hydrated.activeTrip?.serverId === active.id ? hydrated.activeTrip.inspected : null,
          )
          tripIdRef.current = active.id
          setTrip(adapted)
          await controller.setActiveTrip(adapted)
          const conn = await ensureRealtime()
          conn.subscribe(active.id)
        } catch (err) {
          if (cancelled) return
          const kind = classifyApiError(err)
          if (kind === 'AUTH_INVALID' || kind === 'FORBIDDEN') {
            await controller.handleOperationError(err)
            return
          }
          // Transient network failure on startup: keep the hydrated activeTrip ONLY
          // if all trusted active-trip continuity criteria hold.
          const snap = controller.getSnapshot()
          if (!snap.canContinueActiveTrip) {
            tripIdRef.current = null
            setTrip(null)
          }
        }
      })()

      await Promise.all([controller.validate(), tripCheck])
      if (cancelled) return

      const postSnap = controller.getSnapshot()
      if (!postSnap.canContinueActiveTrip && !postSnap.freshlyApproved) {
        setOnline(false)
        setOffer(null)
      } else if (postSnap.freshlyApproved) {
        void ensureRealtime()
        void refreshSummary()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, user?.id, controller, ensureRealtime, refreshSummary])

  /* ── Push: register the device, and treat an offer push as "look now" ── */
  useEffect(() => {
    if (!isAuthenticated) return undefined
    void registerForPush().then(setPushStatus)
    const offTokenChange = onPushTokenChange()

    const onPush = (notification) => {
      if (!isOfferPush(notification)) return
      if (!controller.getSnapshot().canStartOrAcceptNewRide) return
      const data = notification.request.content.data
      if (!data.local) {
        alertedOfferRef.current = data.trip_id ?? alertedOfferRef.current
        setPushDelivers(true)
      }
      void refreshOffers()
    }
    const offOfferPush = onOfferPush(onPush)
    return () => {
      offTokenChange()
      offOfferPush()
    }
  }, [isAuthenticated, controller, refreshOffers])

  /* ── Offer polling: gated by fresh approval and no active trip ────────── */
  useEffect(() => {
    if (!isAuthenticated || !online || trip || !onboardingGate.canStartOrAcceptNewRide) {
      if (!online || !onboardingGate.canStartOrAcceptNewRide) setOffer(null)
      return undefined
    }
    void refreshOffers()
    const every = pushDelivers ? OFFER_POLL_WITH_PUSH_MS : OFFER_POLL_MS
    const timer = setInterval(() => void refreshOffers(), every)
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshOffers()
    })
    return () => {
      clearInterval(timer)
      appState.remove()
    }
  }, [isAuthenticated, online, trip, onboardingGate.canStartOrAcceptNewRide, pushDelivers, refreshOffers])

  /* ── Location tracking for the whole drive, screen on or off ──────────── */
  const driving = trip ? DRIVING.includes(trip.status) : false
  const drivingTripId = driving && onboardingGate.canContinueActiveTrip ? trip.serverId : null
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

  /* ── Actions (with single-flight duplicate protection & auth/approval gates) ── */

  const profileComplete = useMemo(() => {
    if (!summary) return true
    if (typeof summary.profile_complete === 'boolean') return summary.profile_complete
    return Boolean(
      (summary.full_name || user?.full_name || '').trim() &&
        (summary.vehicle_model || '').trim() &&
        (summary.vehicle_plate || '').trim(),
    )
  }, [summary, user?.full_name])

  const updateDriverProfile = useCallback(
    async (patch) => {
      const updated = await api.driver.updateProfile(patch)
      await Promise.all([refreshSummary(), refreshMe()])
      return updated
    },
    [refreshSummary, refreshMe],
  )

  const goOnline = useCallback(
    async (next) => {
      if (next && !controller.getSnapshot().canStartOrAcceptNewRide) {
        throw new Error('Verify your driver approval status before going online.')
      }
      if (next && summary && !profileComplete) {
        throw new Error('Complete your driver profile (name & vehicle details) before going online.')
      }
      setBusy(true)
      try {
        const at = next ? await currentPosition() : undefined
        await api.driver.setAvailability(next ? 'ONLINE' : 'OFFLINE', next ? at : undefined)
        setOnline(next)
        await refreshSummary()
        if (next) await ensureRealtime()
      } catch (err) {
        const kind = await controller.handleOperationError(err)
        if (kind === 'FORBIDDEN' || kind === 'AUTH_INVALID') {
          setOnline(false)
          setOffer(null)
        }
        throw err
      } finally {
        setBusy(false)
      }
    },
    [controller, summary, profileComplete, refreshSummary, ensureRealtime],
  )

  const respondToOffer = useMemo(
    () =>
      createSingleFlight(async (accept) => {
        const pending = offer
        if (!pending) return null
        if (accept && !controller.getSnapshot().canStartOrAcceptNewRide) {
          setOffer(null)
          throw new Error('Driver approval must be verified before accepting a trip.')
        }
        if (accept && summary && !profileComplete) {
          throw new Error('Complete your driver profile before accepting a trip.')
        }

        setBusy(true)
        try {
          const accepted = await api.driver.respondToOffer(pending.serverId, accept)
          setOffer(null)
          if (!accept) return null

          const adapted = {
            ...toRequest(accepted),
            driverId: accepted.driver_id ?? user?.id ?? null,
            customer: pending.customer,
            pickup: pending.pickup,
            drop: pending.drop,
          }
          tripIdRef.current = accepted.id
          setTrip(adapted)
          await controller.setActiveTrip(adapted)
          const conn = await ensureRealtime()
          conn.subscribe(accepted.id)
          return adapted
        } catch (err) {
          await controller.handleOperationError(err)
          throw err
        } finally {
          setBusy(false)
        }
      }),
    [offer, controller, summary, profileComplete, user?.id, ensureRealtime],
  )

  const submitHandshake = useMemo(
    () =>
      createSingleFlight(async (selfieBase64, otp) => {
        const id = tripIdRef.current
        if (!id) throw new Error('No active trip')
        if (!controller.getSnapshot().freshlyApproved) {
          throw new Error('Driver approval must be verified before starting a trip.')
        }
        try {
          const res = await api.driver.handshake(id, selfieBase64, otp)
          const fresh = await api.trips.get(id)
          const adapted = toRequest(fresh, false)
          setTrip(adapted)
          await controller.setActiveTrip(adapted, { inspected: false })
          return res
        } catch (err) {
          await controller.handleOperationError(err)
          throw err
        }
      }),
    [controller],
  )

  /** Only possible before the drive starts; the server refuses it afterwards. */
  const cancelTrip = useMemo(
    () =>
      createSingleFlight(async (reason) => {
        const id = tripIdRef.current
        if (!id) throw new Error('No active trip')
        try {
          await api.trips.cancel(id, reason)
        } catch (err) {
          await controller.handleOperationError(err)
          throw err
        }
        tripIdRef.current = null
        setTrip(null)
        await controller.setActiveTrip(null)
        void controller.validate()
        realtimeRef.current?.unsubscribe(id)
        await refreshSummary()
      }),
    [controller, refreshSummary],
  )

  const sendSos = useCallback(async () => {
    const id = tripIdRef.current
    if (!id) throw new Error('No active trip')
    return api.trips.sos(id, { silent: true })
  }, [])

  /**
   * Completes the trip on the server.
   * Never marks the trip completed locally if the server call fails.
   * Once confirmed by the server, immediately invalidates the active-trip
   * continuity exception and triggers fresh onboarding revalidation in parallel.
   */
  const completeTrip = useMemo(
    () =>
      createSingleFlight(async () => {
        const id = tripIdRef.current
        if (!id) throw new Error('No active trip')
        try {
          // Send what is still buffered first: the fare uses the distance travelled.
          await telemetry.flush(true)
          // Once the trip is closed the server refuses the backlog, so it would
          // never reach the fare. The driver retries on a better connection.
          if (telemetry.queuedCount() > 0) {
            throw new Error('Some of the route has not uploaded yet. Check your connection and try again.')
          }
          const done = await api.driver.complete(id)
          const adapted = toRequest(done, true)
          setTrip(adapted)
          setOffer(null)
          // Immediately invalidate active-trip continuity and require fresh validation.
          // The server puts the driver back ONLINE; stay online here too unless the
          // driver turns it off. The summary read waits for revalidation, else the
          // gate is still REVALIDATION_REQUIRED and it would flip the toggle off.
          await controller.setActiveTrip(adapted)
          void controller.validate().then(() => refreshSummary())
          return adapted
        } catch (err) {
          await controller.handleOperationError(err)
          throw err
        }
      }),
    [controller, refreshSummary],
  )

  const clearTrip = useCallback(() => {
    tripIdRef.current = null
    setTrip(null)
    setOffer(null)
    void controller.setActiveTrip(null)
    if (!controller.getSnapshot().freshlyApproved && !controller.getSnapshot().inFlight) {
      void controller.validate()
    }
  }, [controller])

  const value = useMemo(
    () => ({
      online,
      busy,
      summary,
      profileComplete,
      offer,
      trip,
      connection,
      tracking,
      queued,
      pushStatus,
      onboardingGate,
      reloadOnboarding,
      updateTripInspected,
      updateDriverProfile,
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
      online, busy, summary, profileComplete, offer, trip, connection, tracking, queued, pushStatus,
      onboardingGate, reloadOnboarding, updateTripInspected, updateDriverProfile,
      goOnline, respondToOffer, submitHandshake, cancelTrip, sendSos, completeTrip, clearTrip,
      refreshSummary, refreshOffers,
    ],
  )

  return <DriverCtx.Provider value={value}>{children}</DriverCtx.Provider>
}

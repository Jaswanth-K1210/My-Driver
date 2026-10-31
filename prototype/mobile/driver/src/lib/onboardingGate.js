/**
 * Onboarding validation, active-trip continuity, and request-sequencing gate
 * for the MyDriver Driver App.
 *
 * Security invariants:
 *   1. A network error NEVER synthesizes `onboarding_status: 'APPROVED'`.
 *   2.Onboarding status (`APPROVED`, `PENDING`, `UNDER_REVIEW`, `TESTING`,
 *      `REJECTED`, `SUSPENDED`, `UNKNOWN`), trip lifecycle, and connectivity /
 *      validation state (`VALIDATING`, `VALIDATED`, `NETWORK_ERROR`,
 *      `REVALIDATION_REQUIRED`, `FORBIDDEN`, `AUTH_INVALID`) are tracked
 *      independently.
 *   3. The offline active-trip continuity exception applies ONLY when:
 *        - The driver's approval was previously verified as `APPROVED` for the
 *          same authenticated `driverId`,
 *        - A specific trip was previously confirmed by the server in `IN_TRIP`
 *          or `ESCALATED` (post-handshake),
 *        - The trip belongs to the authenticated `driverId` and has a valid UUID,
 *        - No completion, cancellation, or termination has been confirmed, and
 *        - The failure is a transient connectivity issue (never 401 or 403).
 *   4. The continuity exception permits only finishing/managing the existing
 *      in-progress trip; going online, polling offers, accepting offers, and
 *      starting new rides remain blocked until fresh approval validation succeeds.
 */

export const VALID_ONBOARDING_STATUSES = Object.freeze([
  'APPROVED',
  'PENDING',
  'TESTING',
  'UNDER_REVIEW',
  'REJECTED',
  'SUSPENDED',
])

/** Only post-handshake trips qualify for the active-trip continuity exception. */
export const IN_PROGRESS_TRIP_STATUSES = Object.freeze(['IN_TRIP', 'ESCALATED'])

export const TERMINAL_TRIP_STATUSES = Object.freeze([
  'COMPLETED',
  'CANCELLED',
  'NO_DRIVERS_FOUND',
])

export const STORAGE_KEYS = Object.freeze({
  AUTH_USER: 'mydriver.driver.auth_user',
  VERIFIED_APPROVAL: 'mydriver.driver.verified_approval',
  ACTIVE_TRIP: 'mydriver.driver.active_trip',
})

/**
 * Classifies an API error or response into its actual security meaning.
 * Never treats 401 or 403 as a transient network error.
 */
export function classifyApiError(err) {
  if (!err) return 'NETWORK_ERROR'
  const status = Number(err.status ?? err.statusCode ?? 0)
  const code = String(err.code ?? '')

  if (status === 401 || code === 'UNAUTHENTICATED' || code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') {
    return 'AUTH_INVALID'
  }
  if (status === 403 || code === 'DRIVER_NOT_APPROVED' || code === 'FORBIDDEN' || code === 'FORBIDDEN_ROLE') {
    return 'FORBIDDEN'
  }
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return 'CLIENT_ERROR'
  }
  return 'NETWORK_ERROR'
}

/**
 * Validates that a server onboarding payload has a known onboarding_status.
 * Malformed or unexpected payloads are rejected so the caller fails safely.
 */
export function parseOnboardingPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  const status = payload.onboarding_status
  if (typeof status !== 'string' || !VALID_ONBOARDING_STATUSES.includes(status)) {
    return null
  }
  return {
    ...payload,
    onboarding_status: status,
  }
}

/** Key-sorted JSON, so two payloads compare equal regardless of key order. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/**
 * For the quiet background check on the onboarding screen: true when a freshly
 * fetched payload differs from the one on screen, so the caller should run a
 * full `validate()`. A malformed payload is never a change; this function never
 * grants approval itself.
 */
export function hasOnboardingChanged(current, raw) {
  const next = parseOnboardingPayload(raw)
  if (!next) return false
  return stableStringify(next) !== stableStringify(current ?? null)
}

/**
 * Checks whether a trip object represents a genuine, server-confirmed
 * in-progress trip (`IN_TRIP` or `ESCALATED`) owned by `driverId`.
 * Pre-handshake (`HANDSHAKE_PENDING`) and offer (`MATCHED`) states do NOT qualify.
 */
export function isTrustedInProgressTrip(trip, driverId) {
  if (!trip || typeof trip !== 'object') return false
  if (!driverId || typeof driverId !== 'string') return false
  const tripDriverId = trip.driverId ?? trip.driver_id ?? null
  if (!tripDriverId || tripDriverId !== driverId) return false
  const serverId = trip.serverId ?? trip.id ?? null
  if (typeof serverId !== 'string' || serverId.trim().length < 8) return false
  if (trip.ended === true) return false
  if (TERMINAL_TRIP_STATUSES.includes(trip.status)) return false
  return IN_PROGRESS_TRIP_STATUSES.includes(trip.status)
}

/**
 * Checks all 6 mandatory criteria from Section 3 for the temporary
 * active-trip continuity exception.
 */
export function isTrustedActiveTrip({
  trip,
  driverId,
  verifiedApproval,
  validationState,
  onboardingStatus,
}) {
  // 1. Current failure must be a transient connectivity issue (or validation in flight),
  //    never an explicit 401/403 or a confirmed non-approved status.
  if (validationState === 'AUTH_INVALID' || validationState === 'FORBIDDEN') {
    return false
  }
  if (
    onboardingStatus &&
    onboardingStatus !== 'UNKNOWN' &&
    onboardingStatus !== 'APPROVED'
  ) {
    return false
  }

  // 2. Driver approval must have been previously verified as APPROVED for this driverId.
  if (
    !verifiedApproval ||
    typeof verifiedApproval !== 'object' ||
    verifiedApproval.onboarding_status !== 'APPROVED' ||
    !verifiedApproval.driverId ||
    verifiedApproval.driverId !== driverId ||
    !verifiedApproval.verifiedAt
  ) {
    return false
  }

  // 3–5. Trip must be a confirmed IN_TRIP or ESCALATED trip belonging to driverId
  //      with a valid ID and no confirmed completion/cancellation.
  return isTrustedInProgressTrip(trip, driverId)
}

/**
 * Pure evaluation of the driver gate from the three independent state axes:
 *   - Onboarding status (`onboardingStatus`, historical `verifiedApproval`)
 *   - Trip lifecycle (`activeTrip`)
 *   - Connectivity / validation (`validationState`, `inFlight`)
 */
export function evaluateOnboardingGate({
  userId,
  onboardingStatus = 'UNKNOWN',
  validationState = 'VALIDATING',
  inFlight = false,
  verifiedApproval = null,
  activeTrip = null,
}) {
  if (!userId || validationState === 'AUTH_INVALID') {
    return {
      freshlyApproved: false,
      continuityActive: false,
      canContinueActiveTrip: false,
      canStartOrAcceptNewRide: false,
      revalidationRequired: false,
      viewMode: 'AUTH_REQUIRED',
    }
  }

  const freshlyApproved =
    validationState === 'VALIDATED' && onboardingStatus === 'APPROVED'

  const hasInProgressTrip = isTrustedInProgressTrip(activeTrip, userId)

  // A re-check in flight keeps the last status (APPROVED); a network failure
  // resets it to UNKNOWN. Either way a trusted trip already past the handshake
  // carries on. A confirmed non-approved status never does (isTrustedActiveTrip).
  const continuityActive =
    !freshlyApproved &&
    (validationState === 'NETWORK_ERROR' || validationState === 'VALIDATING') &&
    (onboardingStatus === 'UNKNOWN' || onboardingStatus === 'APPROVED') &&
    isTrustedActiveTrip({
      trip: activeTrip,
      driverId: userId,
      verifiedApproval,
      validationState,
      onboardingStatus,
    })

  const canContinueActiveTrip = (freshlyApproved || continuityActive) && hasInProgressTrip

  const revalidationRequired =
    validationState === 'REVALIDATION_REQUIRED' ||
    (!freshlyApproved && !continuityActive)

  // New rides, going online, offer polling, offer acceptance, and pre-trip
  // handshakes require a freshly validated APPROVED status and no active trip.
  const canStartOrAcceptNewRide =
    freshlyApproved &&
    !hasInProgressTrip &&
    activeTrip?.status !== 'COMPLETED'

  // Determine which top-level screen DriverFlow should render.
  let viewMode = 'LOADING'
  const isCompletedSummary =
    activeTrip &&
    activeTrip.status === 'COMPLETED' &&
    (activeTrip.driverId ?? activeTrip.driver_id) === userId &&
    typeof (activeTrip.serverId ?? activeTrip.id) === 'string'

  if (canContinueActiveTrip) {
    viewMode = 'ACTIVE_TRIP'
  } else if (isCompletedSummary) {
    // Allow viewing the read-only TripSummaryScreen while revalidation runs in parallel.
    viewMode = 'COMPLETED_SUMMARY'
  } else if (freshlyApproved) {
    viewMode = 'HOME'
  } else if (
    validationState === 'VALIDATED' &&
    VALID_ONBOARDING_STATUSES.includes(onboardingStatus) &&
    onboardingStatus !== 'APPROVED'
  ) {
    viewMode = 'ONBOARDING'
  } else if (
    validationState === 'NETWORK_ERROR' ||
    validationState === 'FORBIDDEN' ||
    (validationState === 'REVALIDATION_REQUIRED' && !inFlight)
  ) {
    viewMode = 'RETRY_REQUIRED'
  } else {
    viewMode = 'LOADING'
  }

  return {
    freshlyApproved,
    continuityActive,
    canContinueActiveTrip,
    canStartOrAcceptNewRide,
    revalidationRequired,
    viewMode,
  }
}

/**
 * Stateful controller with request sequencing, epoch invalidation (so delayed
 * responses from before trip completion cannot overwrite `REVALIDATION_REQUIRED`),
 * and secure-storage persistence.
 */
export function createOnboardingController({ api, storage, onAuthInvalid } = {}) {
  let state = {
    userId: null,
    onboarding: null, // full server onboarding object when VALIDATED
    onboardingStatus: 'UNKNOWN',
    validationState: 'VALIDATING', // 'VALIDATING' | 'VALIDATED' | 'NETWORK_ERROR' | 'REVALIDATION_REQUIRED' | 'FORBIDDEN' | 'AUTH_INVALID'
    inFlight: false,
    error: null,
    verifiedApproval: null, // { driverId, onboarding_status: 'APPROVED', verifiedAt }
    activeTrip: null,
  }

  let requestSeq = 0
  let epoch = 0
  const listeners = new Set()

  const notify = () => {
    const snapshot = getSnapshot()
    for (const fn of listeners) fn(snapshot)
  }

  function getSnapshot() {
    const gate = evaluateOnboardingGate(state)
    return {
      ...state,
      ...gate,
    }
  }

  async function readJson(key) {
    if (!storage?.get) return null
    try {
      const raw = await storage.get(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  async function writeJson(key, value) {
    if (!storage?.set) return
    try {
      await storage.set(key, JSON.stringify(value))
    } catch {
      // Ignore storage write errors.
    }
  }

  async function removeKey(key) {
    if (!storage?.remove) return
    try {
      await storage.remove(key)
    } catch {
      // Ignore storage delete errors.
    }
  }

  /**
   * Hydrates historical verified-approval and active-trip evidence for `userId`
   * on app start. Mismatched or malformed records are discarded immediately.
   */
  async function hydrateForUser(userId) {
    if (!userId) {
      await clearAllForLogout()
      return getSnapshot()
    }
    if (state.userId !== userId) {
      epoch += 1
      requestSeq += 1
      state = {
        userId,
        onboarding: null,
        onboardingStatus: 'UNKNOWN',
        validationState: 'VALIDATING',
        inFlight: false,
        error: null,
        verifiedApproval: null,
        activeTrip: null,
      }
    }

    const storedApproval = await readJson(STORAGE_KEYS.VERIFIED_APPROVAL)
    if (
      storedApproval &&
      storedApproval.driverId === userId &&
      storedApproval.onboarding_status === 'APPROVED' &&
      storedApproval.verifiedAt
    ) {
      state.verifiedApproval = storedApproval
    } else {
      state.verifiedApproval = null
      if (storedApproval) await removeKey(STORAGE_KEYS.VERIFIED_APPROVAL)
    }

    const storedTrip = await readJson(STORAGE_KEYS.ACTIVE_TRIP)
    if (storedTrip && isTrustedInProgressTrip(storedTrip.trip, userId)) {
      state.activeTrip = {
        ...storedTrip.trip,
        driverId: userId,
        inspected: storedTrip.inspected ?? null,
      }
    } else {
      state.activeTrip = null
      if (storedTrip) await removeKey(STORAGE_KEYS.ACTIVE_TRIP)
    }

    notify()
    return getSnapshot()
  }

  /**
   * Updates the active trip tracked by the controller.
   * If a previously in-progress trip transitions to COMPLETED, CANCELLED, or null,
   * immediately invalidates the active-trip continuity exception and requires
   * fresh revalidation.
   */
  async function setActiveTrip(trip, opts = {}) {
    const prevWasInProgress = isTrustedInProgressTrip(state.activeTrip, state.userId)
    const normalized = trip
      ? {
          ...trip,
          driverId: trip.driverId ?? trip.driver_id ?? state.userId,
          serverId: trip.serverId ?? trip.id ?? null,
          ...(opts.inspected !== undefined ? { inspected: opts.inspected } : {}),
        }
      : null

    const nextIsInProgress = isTrustedInProgressTrip(normalized, state.userId)

    state.activeTrip = normalized

    if (nextIsInProgress && state.userId) {
      await writeJson(STORAGE_KEYS.ACTIVE_TRIP, {
        driverId: state.userId,
        trip: normalized,
        inspected: normalized.inspected ?? state.activeTrip?.inspected ?? null,
        savedAt: new Date().toISOString(),
      })
    } else {
      await removeKey(STORAGE_KEYS.ACTIVE_TRIP)
    }

    // Section 6: When an active trip completes, is cancelled, or terminates,
    // immediately invalidate the continuity exception and require fresh validation.
    const endedNow =
      prevWasInProgress &&
      !nextIsInProgress

    if (endedNow) {
      // Advance epoch so any in-flight validation started BEFORE trip completion
      // cannot satisfy post-trip revalidation.
      epoch += 1
      requestSeq += 1
      state.onboarding = null
      state.onboardingStatus = 'UNKNOWN'
      state.validationState = 'REVALIDATION_REQUIRED'
      state.inFlight = false
      state.error = null
    }

    notify()
    return getSnapshot()
  }

  /**
   * Validates onboarding status against `api.driver.onboarding()`.
   * Uses `(seq, epoch)` guards so delayed responses never clobber newer states.
   */
  async function validate() {
    if (!state.userId) return getSnapshot()

    const mySeq = ++requestSeq
    const myEpoch = epoch

    state.inFlight = true
    if (state.validationState !== 'REVALIDATION_REQUIRED') {
      state.validationState = 'VALIDATING'
    }
    state.error = null
    notify()

    try {
      const raw = await api.driver.onboarding()
      if (mySeq !== requestSeq || myEpoch !== epoch) {
        return getSnapshot()
      }

      const parsed = parseOnboardingPayload(raw)
      if (!parsed) {
        state.onboarding = null
        state.onboardingStatus = 'UNKNOWN'
        state.validationState = 'NETWORK_ERROR'
        state.inFlight = false
        state.error = { code: 'MALFORMED_ONBOARDING_RESPONSE', message: 'Unexpected server response' }
        notify()
        return getSnapshot()
      }

      state.onboarding = parsed
      state.onboardingStatus = parsed.onboarding_status
      state.validationState = 'VALIDATED'
      state.inFlight = false
      state.error = null

      if (parsed.onboarding_status === 'APPROVED') {
        const record = {
          driverId: state.userId,
          onboarding_status: 'APPROVED',
          verifiedAt: new Date().toISOString(),
        }
        state.verifiedApproval = record
        await writeJson(STORAGE_KEYS.VERIFIED_APPROVAL, record)
      } else {
        // Explicit non-approved status from server revokes any historical approval.
        state.verifiedApproval = null
        await removeKey(STORAGE_KEYS.VERIFIED_APPROVAL)
      }

      notify()
      return getSnapshot()
    } catch (err) {
      if (mySeq !== requestSeq || myEpoch !== epoch) {
        return getSnapshot()
      }

      const kind = classifyApiError(err)
      state.inFlight = false
      state.error = err

      if (kind === 'AUTH_INVALID') {
        state.onboarding = null
        state.onboardingStatus = 'UNKNOWN'
        state.validationState = 'AUTH_INVALID'
        state.verifiedApproval = null
        state.activeTrip = null
        await clearAllForLogout()
        notify()
        await onAuthInvalid?.(err)
        return getSnapshot()
      }

      if (kind === 'FORBIDDEN') {
        // Explicit server-side 403 denial: never override with cached approval or active-trip fallback.
        state.onboarding = null
        state.onboardingStatus = 'UNKNOWN'
        state.validationState = 'FORBIDDEN'
        state.verifiedApproval = null
        await removeKey(STORAGE_KEYS.VERIFIED_APPROVAL)
        notify()
        return getSnapshot()
      }

      // Transient network error or timeout: do NOT overwrite onboardingStatus with APPROVED.
      // Preserve `REVALIDATION_REQUIRED` if we were revalidating after trip end; otherwise `NETWORK_ERROR`.
      state.onboarding = null
      state.onboardingStatus = 'UNKNOWN'
      if (state.validationState !== 'REVALIDATION_REQUIRED') {
        state.validationState = 'NETWORK_ERROR'
      }
      notify()
      return getSnapshot()
    }
  }

  /**
   * Handles an error thrown by a driver or trip operation (e.g., 401 or 403 on
   * going online, fetching offers, handshake, etc.).
   */
  async function handleOperationError(err) {
    const kind = classifyApiError(err)
    if (kind === 'AUTH_INVALID') {
      epoch += 1
      requestSeq += 1
      state.onboarding = null
      state.onboardingStatus = 'UNKNOWN'
      state.validationState = 'AUTH_INVALID'
      state.inFlight = false
      state.verifiedApproval = null
      state.activeTrip = null
      await clearAllForLogout()
      notify()
      await onAuthInvalid?.(err)
      return kind
    }
    if (kind === 'FORBIDDEN') {
      epoch += 1
      requestSeq += 1
      state.onboarding = null
      state.onboardingStatus = 'UNKNOWN'
      state.validationState = 'FORBIDDEN'
      state.inFlight = false
      state.error = err
      state.verifiedApproval = null
      await removeKey(STORAGE_KEYS.VERIFIED_APPROVAL)
      notify()
      return kind
    }
    return kind
  }

  async function clearAllForLogout() {
    epoch += 1
    requestSeq += 1
    state = {
      userId: null,
      onboarding: null,
      onboardingStatus: 'UNKNOWN',
      validationState: 'VALIDATING',
      inFlight: false,
      error: null,
      verifiedApproval: null,
      activeTrip: null,
    }
    await Promise.all([
      removeKey(STORAGE_KEYS.AUTH_USER),
      removeKey(STORAGE_KEYS.VERIFIED_APPROVAL),
      removeKey(STORAGE_KEYS.ACTIVE_TRIP),
    ])
    notify()
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    getSnapshot,
    hydrateForUser,
    setActiveTrip,
    validate,
    handleOperationError,
    clearAllForLogout,
    subscribe,
  }
}

/**
 * Wraps an async action so duplicate concurrent calls share the in-flight
 * promise instead of submitting duplicate requests, while allowing clean
 * retries after a failure.
 */
export function createSingleFlight(fn) {
  let inFlightPromise = null
  return async function singleFlightWrapper(...args) {
    if (inFlightPromise) return inFlightPromise
    inFlightPromise = (async () => {
      try {
        return await fn(...args)
      } finally {
        inFlightPromise = null
      }
    })()
    return inFlightPromise
  }
}

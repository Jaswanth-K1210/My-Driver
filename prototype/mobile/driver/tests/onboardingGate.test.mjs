import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyApiError,
  createOnboardingController,
  createSingleFlight,
  evaluateOnboardingGate,
  hasOnboardingChanged,
  isTrustedActiveTrip,
  isTrustedInProgressTrip,
  parseOnboardingPayload,
  STORAGE_KEYS,
} from '../src/lib/onboardingGate.js'

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    async get(key) {
      return map.has(key) ? map.get(key) : null
    },
    async set(key, value) {
      map.set(key, String(value))
    },
    async remove(key) {
      map.delete(key)
    },
  }
}

const DRIVER_ID = '11111111-2222-3333-4444-555555555555'
const OTHER_DRIVER_ID = '99999999-8888-7777-6666-555555555555'
const TRIP_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('Driver Onboarding Validation & Active-Trip Continuity Gate', () => {
  it('1. Approved driver with successful validation enables HOME and new ride activities', async () => {
    const storage = createMemoryStorage()
    const controller = createOnboardingController({
      storage,
      api: {
        driver: {
          onboarding: async () => ({
            onboarding_status: 'APPROVED',
            review_note: null,
            kyc: { verified: true },
            documents: [],
          }),
        },
      },
    })

    await controller.hydrateForUser(DRIVER_ID)
    const snap = await controller.validate()

    assert.equal(snap.validationState, 'VALIDATED')
    assert.equal(snap.onboardingStatus, 'APPROVED')
    assert.equal(snap.freshlyApproved, true)
    assert.equal(snap.continuityActive, false)
    assert.equal(snap.canStartOrAcceptNewRide, true)
    assert.equal(snap.viewMode, 'HOME')

    const persisted = JSON.parse(await storage.get(STORAGE_KEYS.VERIFIED_APPROVAL))
    assert.equal(persisted.driverId, DRIVER_ID)
    assert.equal(persisted.onboarding_status, 'APPROVED')
  })

  it('2. Pending, under-review, rejected, and suspended responses enforce ONBOARDING and clear prior approval', async () => {
    for (const status of ['PENDING', 'TESTING', 'UNDER_REVIEW', 'REJECTED', 'SUSPENDED']) {
      const storage = createMemoryStorage({
        [STORAGE_KEYS.VERIFIED_APPROVAL]: JSON.stringify({
          driverId: DRIVER_ID,
          onboarding_status: 'APPROVED',
          verifiedAt: '2026-10-18T00:00:00.000Z',
        }),
      })
      const controller = createOnboardingController({
        storage,
        api: {
          driver: {
            onboarding: async () => ({ onboarding_status: status, review_note: 'Check required' }),
          },
        },
      })

      await controller.hydrateForUser(DRIVER_ID)
      const snap = await controller.validate()

      assert.equal(snap.validationState, 'VALIDATED')
      assert.equal(snap.onboardingStatus, status)
      assert.equal(snap.freshlyApproved, false)
      assert.equal(snap.canStartOrAcceptNewRide, false)
      assert.equal(snap.viewMode, 'ONBOARDING')
      assert.equal(await storage.get(STORAGE_KEYS.VERIFIED_APPROVAL), null)
    }
  })

  it('3. Network failure during a trusted, in-progress trip (IN_TRIP / ESCALATED) preserves the trip without claiming fresh approval', async () => {
    for (const tripStatus of ['IN_TRIP', 'ESCALATED']) {
      const storage = createMemoryStorage()
      let networkFail = false
      const controller = createOnboardingController({
        storage,
        api: {
          driver: {
            onboarding: async () => {
              if (networkFail) {
                const err = new Error('Network request failed')
                err.status = 0
                throw err
              }
              return { onboarding_status: 'APPROVED' }
            },
          },
        },
      })

      await controller.hydrateForUser(DRIVER_ID)
      await controller.validate()
      await controller.setActiveTrip({
        serverId: TRIP_ID,
        driverId: DRIVER_ID,
        status: tripStatus,
        inspected: true,
      })

      // Simulate transient network failure during active trip
      networkFail = true
      const snap = await controller.validate()

      assert.equal(snap.validationState, 'NETWORK_ERROR')
      assert.equal(snap.onboardingStatus, 'UNKNOWN')
      assert.equal(snap.freshlyApproved, false)
      assert.equal(snap.continuityActive, true)
      assert.equal(snap.canContinueActiveTrip, true)
      assert.equal(snap.canStartOrAcceptNewRide, false)
      assert.equal(snap.viewMode, 'ACTIVE_TRIP')
      assert.equal(snap.verifiedApproval?.onboarding_status, 'APPROVED')
    }
  })

  it('3b. A re-check in flight (returning from the camera or Maps) keeps a trusted in-progress trip on screen, but not a pre-handshake trip', async () => {
    for (const [tripStatus, continues] of [['IN_TRIP', true], ['ESCALATED', true], ['HANDSHAKE_PENDING', false]]) {
      const storage = createMemoryStorage()
      let answer = null
      const controller = createOnboardingController({
        storage,
        api: {
          driver: {
            onboarding: () =>
              answer ? new Promise((resolve) => (answer.resolve = resolve)) : Promise.resolve({ onboarding_status: 'APPROVED' }),
          },
        },
      })

      await controller.hydrateForUser(DRIVER_ID)
      await controller.validate()
      await controller.setActiveTrip({ serverId: TRIP_ID, driverId: DRIVER_ID, status: tripStatus, inspected: true })

      // The app comes back to the foreground: a second check starts and is still in flight.
      answer = {}
      const pending = controller.validate()
      const during = controller.getSnapshot()

      assert.equal(during.validationState, 'VALIDATING')
      assert.equal(during.onboardingStatus, 'APPROVED')
      assert.equal(during.freshlyApproved, false)
      assert.equal(during.canStartOrAcceptNewRide, false)
      assert.equal(during.canContinueActiveTrip, continues)
      assert.equal(during.viewMode, continues ? 'ACTIVE_TRIP' : 'LOADING')

      // The server now says the driver is suspended: continuity ends at once.
      answer.resolve({ onboarding_status: 'SUSPENDED' })
      const after = await pending
      assert.equal(after.continuityActive, false)
      assert.equal(after.canContinueActiveTrip, false)
      assert.notEqual(after.viewMode, 'ACTIVE_TRIP')
    }
  })

  it('4. Network failure when no trip is in progress (or when trip is only MATCHED / HANDSHAKE_PENDING) never defaults to APPROVED', async () => {
    for (const nonInProgressTrip of [
      null,
      { serverId: TRIP_ID, driverId: DRIVER_ID, status: 'MATCHED' },
      { serverId: TRIP_ID, driverId: DRIVER_ID, status: 'HANDSHAKE_PENDING' },
    ]) {
      const storage = createMemoryStorage({
        [STORAGE_KEYS.VERIFIED_APPROVAL]: JSON.stringify({
          driverId: DRIVER_ID,
          onboarding_status: 'APPROVED',
          verifiedAt: '2026-10-18T00:00:00.000Z',
        }),
      })
      const controller = createOnboardingController({
        storage,
        api: {
          driver: {
            onboarding: async () => {
              const err = new Error('Connection timed out')
              err.status = 0
              throw err
            },
          },
        },
      })

      await controller.hydrateForUser(DRIVER_ID)
      await controller.setActiveTrip(nonInProgressTrip)
      const snap = await controller.validate()

      assert.equal(snap.onboardingStatus, 'UNKNOWN')
      assert.equal(snap.freshlyApproved, false)
      assert.equal(snap.continuityActive, false)
      assert.equal(snap.canContinueActiveTrip, false)
      assert.equal(snap.canStartOrAcceptNewRide, false)
      assert.equal(snap.viewMode, 'RETRY_REQUIRED')
    }
  })

  it('5. Rejects missing, stale, mismatched, or untrusted trip/approval evidence and malformed server responses', async () => {
    // Mismatched driverId on trip
    assert.equal(
      isTrustedActiveTrip({
        trip: { serverId: TRIP_ID, driverId: OTHER_DRIVER_ID, status: 'IN_TRIP' },
        driverId: DRIVER_ID,
        verifiedApproval: { driverId: DRIVER_ID, onboarding_status: 'APPROVED', verifiedAt: '2026-10-18T00:00:00Z' },
        validationState: 'NETWORK_ERROR',
        onboardingStatus: 'UNKNOWN',
      }),
      false,
    )

    // Missing prior verifiedApproval
    assert.equal(
      isTrustedActiveTrip({
        trip: { serverId: TRIP_ID, driverId: DRIVER_ID, status: 'IN_TRIP' },
        driverId: DRIVER_ID,
        verifiedApproval: null,
        validationState: 'NETWORK_ERROR',
        onboardingStatus: 'UNKNOWN',
      }),
      false,
    )

    // Missing valid trip ID
    assert.equal(
      isTrustedInProgressTrip({ serverId: '', driverId: DRIVER_ID, status: 'IN_TRIP' }, DRIVER_ID),
      false,
    )

    // Malformed server payload treated as unknown + retry required
    assert.equal(parseOnboardingPayload(null), null)
    assert.equal(parseOnboardingPayload({ onboarding_status: 'HACKED' }), null)

    const controller = createOnboardingController({
      storage: createMemoryStorage(),
      api: {
        driver: {
          onboarding: async () => ({ unexpected: true }),
        },
      },
    })
    await controller.hydrateForUser(DRIVER_ID)
    const snap = await controller.validate()
    assert.equal(snap.onboardingStatus, 'UNKNOWN')
    assert.equal(snap.freshlyApproved, false)
    assert.equal(snap.viewMode, 'RETRY_REQUIRED')
  })

  it('6. App restart during an active trip while offline restores continuity only for the matching authenticated driver', async () => {
    const storage = createMemoryStorage({
      [STORAGE_KEYS.VERIFIED_APPROVAL]: JSON.stringify({
        driverId: DRIVER_ID,
        onboarding_status: 'APPROVED',
        verifiedAt: '2026-10-18T01:00:00.000Z',
      }),
      [STORAGE_KEYS.ACTIVE_TRIP]: JSON.stringify({
        driverId: DRIVER_ID,
        trip: {
          serverId: TRIP_ID,
          driverId: DRIVER_ID,
          status: 'IN_TRIP',
          pickup: 'HITEC City',
          drop: 'Gachibowli',
        },
        inspected: true,
        savedAt: '2026-10-18T01:05:00.000Z',
      }),
    })

    const offlineController = createOnboardingController({
      storage,
      api: {
        driver: {
          onboarding: async () => {
            throw new Error('Offline')
          },
        },
      },
    })

    const hydrated = await offlineController.hydrateForUser(DRIVER_ID)
    assert.equal(hydrated.activeTrip?.serverId, TRIP_ID)
    assert.equal(hydrated.activeTrip?.inspected, true)

    const afterOfflineValidate = await offlineController.validate()
    assert.equal(afterOfflineValidate.continuityActive, true)
    assert.equal(afterOfflineValidate.canContinueActiveTrip, true)
    assert.equal(afterOfflineValidate.canStartOrAcceptNewRide, false)
    assert.equal(afterOfflineValidate.viewMode, 'ACTIVE_TRIP')

    // Restarting as a different user must discard the previous user's persisted evidence
    const wrongUserSnap = await offlineController.hydrateForUser(OTHER_DRIVER_ID)
    assert.equal(wrongUserSnap.verifiedApproval, null)
    assert.equal(wrongUserSnap.activeTrip, null)
    assert.equal(wrongUserSnap.continuityActive, false)
  })

  it('7 & 8. Trip completion immediately invalidates continuity, allows read-only COMPLETED_SUMMARY, and blocks new rides until revalidation succeeds', async () => {
    const storage = createMemoryStorage()
    let shouldFailValidation = false

    const controller = createOnboardingController({
      storage,
      api: {
        driver: {
          onboarding: async () => {
            if (shouldFailValidation) throw new Error('Network unreachable')
            return { onboarding_status: 'APPROVED' }
          },
        },
      },
    })

    await controller.hydrateForUser(DRIVER_ID)
    await controller.validate()
    await controller.setActiveTrip({
      serverId: TRIP_ID,
      driverId: DRIVER_ID,
      status: 'IN_TRIP',
    })

    // Trip completes on server while subsequent onboarding revalidation fails
    shouldFailValidation = true
    const onCompleteSnap = await controller.setActiveTrip({
      serverId: TRIP_ID,
      driverId: DRIVER_ID,
      status: 'COMPLETED',
    })

    assert.equal(onCompleteSnap.continuityActive, false)
    assert.equal(onCompleteSnap.canContinueActiveTrip, false)
    assert.equal(onCompleteSnap.canStartOrAcceptNewRide, false)
    assert.equal(onCompleteSnap.validationState, 'REVALIDATION_REQUIRED')
    assert.equal(onCompleteSnap.viewMode, 'COMPLETED_SUMMARY')
    assert.equal(await storage.get(STORAGE_KEYS.ACTIVE_TRIP), null)

    // Revalidation attempt fails while on summary screen
    const failedRevalSnap = await controller.validate()
    assert.equal(failedRevalSnap.freshlyApproved, false)
    assert.equal(failedRevalSnap.canStartOrAcceptNewRide, false)
    assert.equal(failedRevalSnap.viewMode, 'COMPLETED_SUMMARY')

    // Driver taps "Done" on summary screen -> must land on RETRY_REQUIRED, not HOME
    const afterDismissSnap = await controller.setActiveTrip(null)
    assert.equal(afterDismissSnap.viewMode, 'RETRY_REQUIRED')
    assert.equal(afterDismissSnap.canStartOrAcceptNewRide, false)

    // Once network recovers and revalidation succeeds, normal HOME access is restored
    shouldFailValidation = false
    const recoveredSnap = await controller.validate()
    assert.equal(recoveredSnap.freshlyApproved, true)
    assert.equal(recoveredSnap.canStartOrAcceptNewRide, true)
    assert.equal(recoveredSnap.viewMode, 'HOME')
  })

  it('9. HTTP 401 and HTTP 403 responses are never treated as transient network errors and override cached state', async () => {
    assert.equal(classifyApiError({ status: 401 }), 'AUTH_INVALID')
    assert.equal(classifyApiError({ status: 403, code: 'DRIVER_NOT_APPROVED' }), 'FORBIDDEN')

    const storage = createMemoryStorage({
      [STORAGE_KEYS.AUTH_USER]: JSON.stringify({ id: DRIVER_ID, role: 'DRIVER' }),
    })
    let authInvalidCalled = 0

    const controller = createOnboardingController({
      storage,
      onAuthInvalid: async () => {
        authInvalidCalled += 1
      },
      api: {
        driver: {
          onboarding: async () => ({ onboarding_status: 'APPROVED' }),
        },
      },
    })

    await controller.hydrateForUser(DRIVER_ID)
    await controller.validate()
    await controller.setActiveTrip({
      serverId: TRIP_ID,
      driverId: DRIVER_ID,
      status: 'IN_TRIP',
    })

    // 403 Forbidden revokes verifiedApproval and blocks continuity
    await controller.handleOperationError({ status: 403, code: 'DRIVER_NOT_APPROVED', message: 'Suspended' })
    const forbiddenSnap = controller.getSnapshot()
    assert.equal(forbiddenSnap.validationState, 'FORBIDDEN')
    assert.equal(forbiddenSnap.continuityActive, false)
    assert.equal(forbiddenSnap.canStartOrAcceptNewRide, false)
    assert.equal(await storage.get(STORAGE_KEYS.VERIFIED_APPROVAL), null)

    // 401 Unauthorized triggers auth recovery and clears all storage keys
    await controller.handleOperationError({ status: 401, code: 'UNAUTHENTICATED' })
    const unauthSnap = controller.getSnapshot()
    assert.equal(unauthSnap.viewMode, 'AUTH_REQUIRED')
    assert.equal(authInvalidCalled, 1)
    assert.equal(await storage.get(STORAGE_KEYS.AUTH_USER), null)
    assert.equal(await storage.get(STORAGE_KEYS.ACTIVE_TRIP), null)
  })

  it('10. Delayed API responses from before trip completion or an older request cannot overwrite newer state', async () => {
    let resolveSlowPreCompletion
    let callCount = 0

    const controller = createOnboardingController({
      storage: createMemoryStorage(),
      api: {
        driver: {
          onboarding: () => {
            callCount += 1
            if (callCount === 1) {
              return new Promise((resolve) => {
                resolveSlowPreCompletion = resolve
              })
            }
            return Promise.reject(new Error('Network error on post-trip revalidation'))
          },
        },
      },
    })

    await controller.hydrateForUser(DRIVER_ID)
    await controller.setActiveTrip({
      serverId: TRIP_ID,
      driverId: DRIVER_ID,
      status: 'IN_TRIP',
    })

    // Start slow validation #1 while trip is still IN_TRIP
    const firstPromise = controller.validate()

    // Trip completes before validation #1 finishes -> advances epoch and requires revalidation
    await controller.setActiveTrip(null)
    assert.equal(controller.getSnapshot().validationState, 'REVALIDATION_REQUIRED')

    // Now the delayed validation #1 resolves with APPROVED
    resolveSlowPreCompletion({ onboarding_status: 'APPROVED' })
    await firstPromise

    // Stale pre-completion response must be ignored!
    const snapAfterStale = controller.getSnapshot()
    assert.equal(snapAfterStale.validationState, 'REVALIDATION_REQUIRED')
    assert.equal(snapAfterStale.freshlyApproved, false)
    assert.equal(snapAfterStale.canStartOrAcceptNewRide, false)
    assert.equal(snapAfterStale.viewMode, 'RETRY_REQUIRED')
  })

  it('11. Single-flight wrapper prevents duplicate concurrent trip submissions and permits retry after failure', async () => {
    let attempts = 0
    let shouldFail = true

    const completeAction = createSingleFlight(async (tripId) => {
      attempts += 1
      await new Promise((r) => setTimeout(r, 20))
      if (shouldFail) throw new Error('Transient timeout')
      return { id: tripId, status: 'COMPLETED' }
    })

    // Concurrent duplicate taps while in flight share the same execution
    const [r1, r2] = await Promise.allSettled([completeAction(TRIP_ID), completeAction(TRIP_ID)])
    assert.equal(attempts, 1)
    assert.equal(r1.status, 'rejected')
    assert.equal(r2.status, 'rejected')

    // Subsequent retry after failure runs cleanly
    shouldFail = false
    const [r3, r4] = await Promise.all([completeAction(TRIP_ID), completeAction(TRIP_ID)])
    assert.equal(attempts, 2)
    assert.deepEqual(r3, { id: TRIP_ID, status: 'COMPLETED' })
    assert.deepEqual(r4, { id: TRIP_ID, status: 'COMPLETED' })
  })

  it('12. Backend rejection of unauthorized operations overrides client state while permitting safe mid-trip completion', async () => {
    let serverOnboardingStatus = 'APPROVED'
    let serverAvailability = 'ONLINE'
    const escalations = []

    // Simulated authoritative backend policy matching geo-index.ts, matching.ts, handshake.ts, and admin-ops/service.ts
    const backendApi = {
      driver: {
        onboarding: async () => ({ onboarding_status: serverOnboardingStatus }),
        setAvailability: async (availability) => {
          if (availability === 'ONLINE' && serverOnboardingStatus !== 'APPROVED') {
            throw Object.assign(new Error('Driver onboarding approval is required for this action'), {
              status: 403,
              code: 'DRIVER_NOT_APPROVED',
            })
          }
          serverAvailability = availability
          return { availability: serverAvailability }
        },
        offers: async () => {
          if (serverOnboardingStatus !== 'APPROVED') {
            throw Object.assign(new Error('Driver onboarding approval is required for this action'), {
              status: 403,
              code: 'DRIVER_NOT_APPROVED',
            })
          }
          return { offers: [] }
        },
      },
      trips: {
        respondToOffer: async (_tripId, accept) => {
          if (accept && serverOnboardingStatus !== 'APPROVED') {
            throw Object.assign(new Error('Driver onboarding approval is required for this action'), {
              status: 403,
              code: 'DRIVER_NOT_APPROVED',
            })
          }
          return { status: accept ? 'HANDSHAKE_PENDING' : 'DECLINED' }
        },
        handshake: async (_tripId) => {
          if (serverOnboardingStatus !== 'APPROVED') {
            throw Object.assign(new Error('Driver onboarding approval is required for this action'), {
              status: 403,
              code: 'DRIVER_NOT_APPROVED',
            })
          }
          return { status: 'HANDSHAKE_PASSED', trip_state: 'IN_TRIP' }
        },
        complete: async (tripId) => {
          // Safe completion is permitted even if suspended mid-trip, but restores OFFLINE instead of ONLINE
          serverAvailability = serverOnboardingStatus === 'APPROVED' ? 'ONLINE' : 'OFFLINE'
          return { id: tripId, status: 'COMPLETED' }
        },
      },
      adminSuspendMidTrip: (tripId) => {
        serverOnboardingStatus = 'SUSPENDED'
        escalations.push({ tripId, level: 'L2', reason: 'DRIVER_SUSPENDED_DURING_TRIP', status: 'OPEN' })
      },
    }

    const storage = createMemoryStorage()
    const controller = createOnboardingController({ storage, api: backendApi })
    await controller.hydrateForUser(DRIVER_ID)
    await controller.validate()

    // Admin suspends driver while client still thinks it is APPROVED
    serverOnboardingStatus = 'SUSPENDED'

    for (const op of [
      () => backendApi.driver.setAvailability('ONLINE'),
      () => backendApi.driver.offers(),
      () => backendApi.trips.respondToOffer(TRIP_ID, true),
      () => backendApi.trips.handshake(TRIP_ID),
    ]) {
      let rejected = null
      try {
        await op()
      } catch (err) {
        rejected = err
        await controller.handleOperationError(err)
      }
      assert.ok(rejected)
      assert.equal(rejected.status, 403)
      assert.equal(rejected.code, 'DRIVER_NOT_APPROVED')
      assert.equal(controller.getSnapshot().canStartOrAcceptNewRide, false)
      assert.equal(controller.getSnapshot().validationState, 'FORBIDDEN')
    }

    // Re-approve, start an IN_TRIP ride, then suspend mid-trip
    serverOnboardingStatus = 'APPROVED'
    await controller.validate()
    await controller.setActiveTrip({
      serverId: TRIP_ID,
      driverId: DRIVER_ID,
      status: 'IN_TRIP',
    })

    backendApi.adminSuspendMidTrip(TRIP_ID)
    assert.equal(escalations.length, 1)
    assert.equal(escalations[0].reason, 'DRIVER_SUSPENDED_DURING_TRIP')

    // Driver can still complete the active trip safely, then is forced OFFLINE and into ONBOARDING
    const completed = await backendApi.trips.complete(TRIP_ID)
    assert.equal(completed.status, 'COMPLETED')
    assert.equal(serverAvailability, 'OFFLINE')

    await controller.setActiveTrip({
      serverId: TRIP_ID,
      driverId: DRIVER_ID,
      status: 'COMPLETED',
    })
    await controller.validate()
    await controller.setActiveTrip(null)

    const finalSnap = controller.getSnapshot()
    assert.equal(finalSnap.onboardingStatus, 'SUSPENDED')
    assert.equal(finalSnap.canStartOrAcceptNewRide, false)
    assert.equal(finalSnap.viewMode, 'ONBOARDING')
  })
})

describe('hasOnboardingChanged (quiet poll while UNDER_REVIEW)', () => {
  const current = {
    onboarding_status: 'UNDER_REVIEW',
    review_note: null,
    kyc: { pan: { status: 'VERIFIED' }, aadhaar: { status: 'VERIFIED' } },
    documents: [{ kind: 'DRIVING_LICENCE', status: 'SUBMITTED' }],
  }

  it('is false for the same payload, even with keys in another order', () => {
    const raw = {
      documents: [{ status: 'SUBMITTED', kind: 'DRIVING_LICENCE' }],
      kyc: { aadhaar: { status: 'VERIFIED' }, pan: { status: 'VERIFIED' } },
      review_note: null,
      onboarding_status: 'UNDER_REVIEW',
    }
    assert.equal(hasOnboardingChanged(current, raw), false)
  })

  it('is true when the status or a document changes', () => {
    assert.equal(hasOnboardingChanged(current, { ...current, onboarding_status: 'APPROVED' }), true)
    assert.equal(
      hasOnboardingChanged(current, { ...current, documents: [{ kind: 'DRIVING_LICENCE', status: 'VERIFIED' }] }),
      true,
    )
  })

  it('treats a malformed payload as no change, so it can never trigger approval', () => {
    assert.equal(hasOnboardingChanged(current, null), false)
    assert.equal(hasOnboardingChanged(current, { onboarding_status: 'SUPER_APPROVED' }), false)
  })
})

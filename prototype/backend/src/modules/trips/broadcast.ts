import type { LatLng } from '../../lib/geo.js'
import { getHub } from '../../realtime/hub.js'
import { opsChanged } from '../../realtime/ops-feed.js'
import { redis } from '../../redis/client.js'
import { notifyCustomer } from './customer-push.js'
import type { TripStatus } from './state-machine.js'

/**
 * The gateway caches trip participants and status (TRIP_ROLES_TTL_SECONDS).
 * Any status change must drop that cache or telemetry authorisation reads
 * stale state.
 */
export async function invalidateTripCache(tripId: string): Promise<void> {
  await redis.del(`trip:{${tripId}}:roles`)
}

export async function broadcastStateChange(
  tripId: string,
  status: TripStatus,
): Promise<void> {
  await invalidateTripCache(tripId)
  await getHub().publish(tripId, { type: 'TRIP_STATE_CHANGED', trip_id: tripId, status })
  await opsChanged()
  // The frame above only reaches an open app; the push reaches a closed one.
  await notifyCustomer(tripId, status)
}

export async function broadcastOffer(
  tripId: string,
  expiresAt: Date,
  pickup: LatLng,
  fareEstimate: number | null,
): Promise<void> {
  await getHub().publish(tripId, {
    type: 'TRIP_OFFER',
    trip_id: tripId,
    expires_at: expiresAt.toISOString(),
    pickup,
    fare_estimate: fareEstimate,
  })
}

import { liveDrivers } from '../modules/safety-desk/service.js'
import { redis } from '../redis/client.js'
import { getHub, tripChannel } from './hub.js'

/**
 * The operations console's live feed, carried on the same hub as trips.
 * These room ids are not UUIDs, so they can never collide with a trip's.
 * Only Safety Desk roles may join them (gateway.ts).
 */
export const OPS_ROOMS = { board: 'ops:board', map: 'ops:map' } as const
export type OpsView = keyof typeof OPS_ROOMS

/** Joining a room is the same audited act as opening that screen. */
export const OPS_AUDIT_ACTION: Record<OpsView, string> = {
  board: 'VIEW_LIVE_BOARD',
  map: 'VIEW_DRIVER_MAP',
}

/**
 * Something on the live board changed (a trip's status, an escalation). The
 * frame carries no data: open boards refetch, so what an agent sees always
 * goes through the same audited, demo-filtered endpoints.
 */
export async function opsChanged(): Promise<void> {
  await getHub().publish(OPS_ROOMS.board, { type: 'OPS_CHANGED' }).catch(() => undefined)
}

export const OPS_MAP_INTERVAL_MS = 3_000

/**
 * Driver positions for every open console map. Positions change constantly,
 * so they are pushed on a beat rather than per fix: one instance per beat
 * (the Redis claim) reads them once and the hub fans them out, however many
 * maps are open. Nothing is read while no map is open anywhere.
 */
export async function publishLiveDrivers(): Promise<boolean> {
  const numsub = (await redis.pubsub('NUMSUB', tripChannel(OPS_ROOMS.map))) as unknown as [string, number]
  if (Number(numsub[1]) === 0) return false
  const claimed = await redis.set('ops:map:beat', '1', 'PX', OPS_MAP_INTERVAL_MS - 250, 'NX')
  if (claimed === null) return false
  await getHub().publish(OPS_ROOMS.map, { type: 'DRIVERS_LIVE', drivers: await liveDrivers() })
  return true
}

export function startOpsFeed(): () => void {
  const timer = setInterval(() => {
    void publishLiveDrivers().catch((err) => console.error('ops map feed failed', err))
  }, OPS_MAP_INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}

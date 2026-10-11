import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from './apiClient'

/**
 * One path for every location fix on a trip, whether the app is open, in the
 * background, or was relaunched by the OS just to deliver a fix.
 *
 * A fix goes straight over the WebSocket when that is open and nothing is
 * waiting. Otherwise it joins a queue that is kept on disk and replayed, oldest
 * first, through POST /v1/trips/:id/telemetry. While the queue holds anything,
 * new fixes join it too: the server treats the last point of a batch as the
 * car's current position, so replaying old points beside live ones would drag
 * the car backwards on the customer's map.
 */

const STORE_KEY = 'mydriver.telemetry.v1'
// The server takes 300 points a batch and thins to one a second.
const BATCH_POINTS = 300
// Two hours at one fix a second. Past this the oldest fixes are dropped: a
// single storage row has to stay well under Android's 2 MB row limit.
const MAX_QUEUED = 7200
const FLUSH_EVERY_MS = 10_000
const PERSIST_EVERY_MS = 5_000

let tripId = null
let startedAt = null
let queue = []
let loaded = false
let flushing = false
let lastFlushAt = 0
let lastPersistAt = 0
let transport = null
const listeners = new Set()

/** Compact on disk: [timestamp, lat, lng, speed, heading, accel_z, gyro_z]. */
const pack = (p) => [
  p.timestamp, p.coords.lat, p.coords.lng, p.coords.speed ?? null, p.coords.heading ?? null,
  p.sensors?.accel_z ?? null, p.sensors?.gyro_z ?? null,
]
const unpack = ([timestamp, lat, lng, speed, heading, az, gz]) => ({
  timestamp,
  coords: { lat, lng, ...(speed != null ? { speed } : {}), ...(heading != null ? { heading } : {}) },
  ...(az != null || gz != null ? { sensors: { ...(az != null ? { accel_z: az } : {}), ...(gz != null ? { gyro_z: gz } : {}) } } : {}),
})

async function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw)
    // Fixes recorded before the load finished stay at the end, in order.
    if (!tripId) tripId = saved.tripId ?? null
    if (saved.tripId !== tripId) return
    if (Array.isArray(saved.queue)) queue = [...saved.queue, ...queue]
    // The earlier of the two: the app may have restarted in the middle of the drive.
    if (saved.startedAt) startedAt = Math.min(saved.startedAt, startedAt ?? saved.startedAt)
  } catch {
    // An unreadable store is treated as empty.
  }
}

async function persist(force = false) {
  const now = Date.now()
  if (!force && now - lastPersistAt < PERSIST_EVERY_MS) return
  lastPersistAt = now
  try {
    if (tripId) await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ tripId, startedAt, queue }))
    else await AsyncStorage.removeItem(STORE_KEY)
  } catch {
    // Disk full or unavailable: the in-memory queue still works.
  }
}

/** The WebSocket connection (api.realtime()) to prefer while it is open. */
export function setTransport(conn) {
  transport = conn
}

/** Called with { queued } whenever the backlog size changes. */
export function onQueueChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const notify = () => {
  for (const l of listeners) l({ queued: queue.length })
}

export async function beginTrip(id) {
  await load()
  if (tripId !== id) {
    tripId = id
    queue = []
    startedAt = null
  }
  startedAt ??= Date.now()
  await persist(true)
  notify()
}

/** Sends what is left, then forgets the trip. */
export async function endTrip() {
  await flush(true)
  tripId = null
  startedAt = null
  queue = []
  await persist(true)
  notify()
}

export async function activeTripId() {
  await load()
  return tripId
}

/** When tracking began for the current trip (ms), kept across app restarts. */
export function tripStartedAt() {
  return startedAt
}

export function queuedCount() {
  return queue.length
}

/**
 * Record one fix: { timestamp, coords: { lat, lng, speed?, heading? }, sensors? }.
 * Safe to call from the background location task.
 */
export async function record(point) {
  await load()
  if (!tripId) return

  if (transport?.isOpen && queue.length === 0 && !flushing) {
    transport.sendDriverTelemetry(tripId, point.coords, point.sensors)
    return
  }

  queue.push(pack(point))
  if (queue.length > MAX_QUEUED) queue.splice(0, queue.length - MAX_QUEUED)
  notify()
  void persist()
  if (Date.now() - lastFlushAt >= FLUSH_EVERY_MS) void flush()
}

/** Replays the backlog. Stops at the first network failure and keeps the rest. */
export async function flush(force = false) {
  await load()
  if (flushing || !tripId || queue.length === 0) return
  if (!force && Date.now() - lastFlushAt < 1000) return
  flushing = true
  lastFlushAt = Date.now()
  const id = tripId
  try {
    while (queue.length > 0 && tripId === id) {
      const chunk = queue.slice(0, BATCH_POINTS)
      try {
        await api.trips.sendTelemetryBatch(id, chunk.map(unpack))
      } catch (err) {
        // Offline, or the server is down: keep everything and try again later.
        if (err?.code === 'NETWORK_ERROR' || err?.status >= 500 || err?.status === 429) break
        // The trip is over, or this driver is no longer on it: nothing left to send.
        if (['TRIP_NOT_ACTIVE', 'TRIP_NOT_FOUND', 'FORBIDDEN_TRIP'].includes(err?.code)) {
          queue = []
          break
        }
        // Signed out mid-trip: the fixes are still wanted once the session is back.
        if (err?.status === 401) break
        // Anything else is a batch the server will never accept; drop it so it
        // cannot block the fixes behind it.
      }
      queue.splice(0, chunk.length)
      notify()
    }
  } finally {
    flushing = false
    await persist(true)
    notify()
  }
}

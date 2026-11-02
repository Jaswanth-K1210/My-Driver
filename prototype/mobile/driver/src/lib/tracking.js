import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { colors } from '../theme/tokens'
import * as telemetry from './telemetry'

/**
 * Trip location tracking that keeps going with the screen off or the app in
 * the background: an Android foreground service (with its ongoing
 * notification) and the iOS `location` background mode.
 *
 * This file must be imported from index.js. The OS can start the app with no
 * UI just to deliver a fix, and the task has to be defined by then.
 */

export const TRACKING_TASK = 'mydriver-trip-tracking'

const fixListeners = new Set()
let sensorSource = null
let foregroundWatch = null

/** Screens subscribe for the live speed readout. */
export function onFix(listener) {
  fixListeners.add(listener)
  return () => fixListeners.delete(listener)
}

/** The drive screen supplies the latest g-forces to stamp onto each fix. */
export function setSensorSource(fn) {
  sensorSource = fn
}

function handle(location) {
  const { coords, timestamp } = location
  // iOS reports -1 (Android null) when it does not know. Unknown is sent as
  // absent, not 0: a 0 speed reads as "stopped" and a 0 heading as "north".
  const known = (v) => v != null && v >= 0
  const point = {
    timestamp: Math.round(timestamp ?? Date.now()),
    coords: {
      lat: coords.latitude,
      lng: coords.longitude,
      ...(known(coords.speed) ? { speed: Math.round(coords.speed * 3.6) } : {}),
      ...(known(coords.heading) ? { heading: coords.heading } : {}),
      // The server keeps imprecise and fake (Android mock-location) fixes out of the fare.
      ...(coords.accuracy != null ? { accuracy: Math.round(coords.accuracy) } : {}),
      ...(location.mocked ? { mocked: true } : {}),
    },
    sensors: sensorSource?.(),
  }
  for (const l of fixListeners) l(point)
  return telemetry.record(point)
}

TaskManager.defineTask(TRACKING_TASK, async ({ data, error }) => {
  if (error || !data?.locations) return
  for (const location of data.locations) await handle(location)
  // With no UI alive there is no socket, so make sure the backlog moves.
  if (fixListeners.size === 0) await telemetry.flush()
})

const UPDATES = {
  accuracy: Location.Accuracy.BestForNavigation,
  // The server keeps one fix a second, so asking for more only costs battery.
  timeInterval: 1000,
  distanceInterval: 0,
}

/**
 * Starts tracking for a trip. Returns how it is running:
 *   'background' — continues with the screen off or the app minimised
 *   'foreground' — only while the app is open (Expo Go, or "Allow all the
 *                  time" was not granted)
 *   'denied'     — no location permission at all
 */
export async function startTracking(tripId) {
  await telemetry.beginTrip(tripId)

  const fg = await Location.requestForegroundPermissionsAsync()
  if (fg.status !== 'granted') return 'denied'

  try {
    // Asked second and allowed to fail: Android can still track through the
    // foreground service on "While using the app".
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined)

    if (!(await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK))) {
      await Location.startLocationUpdatesAsync(TRACKING_TASK, {
        ...UPDATES,
        activityType: Location.ActivityType.AutomotiveNavigation,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'MyDriver trip in progress',
          notificationBody: 'Sharing your location with the customer and the Safety Desk.',
          notificationColor: colors.red,
          killServiceOnDestroy: false,
        },
      })
    }
    return 'background'
  } catch {
    // Expo Go, or the OS refused background updates: track while the app is open.
    if (!foregroundWatch) {
      foregroundWatch = await Location.watchPositionAsync(UPDATES, (location) => void handle(location))
    }
    return 'foreground'
  }
}

export async function stopTracking() {
  foregroundWatch?.remove()
  foregroundWatch = null
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK)) {
      await Location.stopLocationUpdatesAsync(TRACKING_TASK)
    }
  } catch {
    // Not running, or the task manager is unavailable (Expo Go).
  }
  await telemetry.endTrip()
}

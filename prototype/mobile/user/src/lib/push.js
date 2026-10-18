import { isRunningInExpoGo } from 'expo'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { colors } from '../theme/tokens'
import { api } from './apiClient'

/** Must match the `channel` the backend sends (trips/customer-push.ts). */
export const TRIPS_CHANNEL = 'trips'

/**
 * The `data.type` values the backend sends for a customer's trip:
 * DRIVER_MATCHED, TRIP_STARTED, TRIP_ENDED, PAYMENT_DUE, TRIP_CANCELLED and
 * NO_DRIVERS_FOUND. Every one carries `trip_id`.
 */
export const tripIdFrom = (notification) => notification?.request?.content?.data?.trip_id ?? null
export const pushTypeFrom = (notification) => notification?.request?.content?.data?.type ?? null

const platform = Platform.OS === 'ios' ? 'ios' : 'android'
let registeredToken = null

/** Remote push was removed from Expo Go on Android; it needs a development build. */
export const isExpoGo =
  (typeof isRunningInExpoGo === 'function' && isRunningInExpoGo()) ||
  Constants.executionEnvironment === 'storeClient'
const isExpoGoAndroid = isExpoGo && Platform.OS === 'android'

let notificationsMod = null
let handlerConfigured = false

function getNotifications() {
  if (isExpoGoAndroid) return null
  if (!notificationsMod) {
    try {
      notificationsMod = require('expo-notifications')
    } catch {
      return null
    }
  }
  if (notificationsMod && !handlerConfigured) {
    handlerConfigured = true
    try {
      // Show the banner even with the app open: the customer may be on another tab
      // when the driver accepts or the trip ends.
      notificationsMod.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldSetBadge: false,
        }),
      })
    } catch {
      // Ignore in unsupported environments.
    }
  }
  return notificationsMod
}

async function register(token) {
  await api.devices.register(platform, String(token))
  registeredToken = String(token)
}

async function setupChannel() {
  if (Platform.OS !== 'android') return
  const Notifications = getNotifications()
  if (!Notifications) return
  await Notifications.setNotificationChannelAsync(TRIPS_CHANNEL, {
    name: 'Trip updates',
    description: 'Driver on the way, trip started, trip ended and payments due.',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    lightColor: colors.red,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  })
}

/**
 * Asks for permission, then registers this device's native push token (FCM on
 * Android, APNs on iOS) with the backend. Returns { ok, reason } and never
 * throws: with the app open, trip updates still arrive over the WebSocket.
 */
export async function registerForPush() {
  try {
    if (isExpoGoAndroid) return { ok: false, reason: 'expo-go' }
    const Notifications = getNotifications()
    if (!Notifications) return { ok: false, reason: 'unavailable' }

    await setupChannel()
    const current = await Notifications.getPermissionsAsync()
    const granted =
      current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted)
    if (!granted) return { ok: false, reason: 'permission' }
    if (!Device.isDevice) return { ok: false, reason: 'simulator' }

    const { data: token } = await Notifications.getDevicePushTokenAsync()
    await register(token)
    return { ok: true, reason: null }
  } catch (err) {
    return { ok: false, reason: err?.message ?? 'unavailable' }
  }
}

/** The OS can replace the token at any time; the backend must hear about it. */
export function onPushTokenChange() {
  const Notifications = getNotifications()
  if (!Notifications) return () => {}
  try {
    const sub = Notifications.addPushTokenListener(({ data: token }) => {
      register(token).catch(() => undefined)
    })
    return () => sub.remove()
  } catch {
    return () => {}
  }
}

/**
 * Sign-out: stop this phone receiving the account's trip updates. Must run
 * before the session is dropped. Never throws.
 */
export async function unregisterPush() {
  try {
    const Notifications = getNotifications()
    const token =
      registeredToken ??
      (Device.isDevice && Notifications ? String((await Notifications.getDevicePushTokenAsync()).data) : null)
    if (token) await api.devices.unregister(token)
  } catch {
    // Offline, or no token was ever issued: nothing to remove.
  }
  registeredToken = null
}

/**
 * Calls `onPush(notification, { tapped })` for a push that arrives while the
 * app is open, for one the customer taps, and for the one that launched the
 * app from closed. Returns an unsubscribe function.
 */
export function onTripPush(onPush) {
  const Notifications = getNotifications()
  if (!Notifications) return () => {}
  try {
    const received = Notifications.addNotificationReceivedListener((n) => onPush(n, { tapped: false }))
    const tapped = Notifications.addNotificationResponseReceivedListener((r) =>
      onPush(r.notification, { tapped: true }),
    )
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (r?.notification) onPush(r.notification, { tapped: true })
      })
      .catch(() => undefined)
    return () => {
      received.remove()
      tapped.remove()
    }
  } catch {
    return () => {}
  }
}

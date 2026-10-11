import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform, Vibration } from 'react-native'
import { colors } from '../theme/tokens'
import { api } from './apiClient'

/** Must match the `channel` the backend sends with an offer push. */
export const OFFERS_CHANNEL = 'offers'
export const REMINDERS_CHANNEL = 'reminders'

const OFFER_VIBRATION = [0, 400, 200, 400, 200, 400]

const platform = Platform.OS === 'ios' ? 'ios' : 'android'
let registeredToken = null

async function register(token) {
  await api.devices.register(platform, String(token))
  registeredToken = String(token)
}

// Show and sound a notification even when the app is open: an offer lasts 20
// seconds and the driver may be looking at another screen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldSetBadge: false,
  }),
})

/** Remote push was removed from Expo Go on Android; it needs a development build. */
export const isExpoGo = Constants.executionEnvironment === 'storeClient'

export async function setupChannels() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(OFFERS_CHANNEL, {
    name: 'Trip requests',
    description: 'New trip offers. These expire in 20 seconds.',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: OFFER_VIBRATION,
    lightColor: colors.red,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
  await Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL, {
    name: 'Document reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

/**
 * Asks for permission, then registers this device's native push token (FCM on
 * Android, APNs on iOS) with the backend. Returns { ok, reason } and never
 * throws: offers still arrive by polling when push is unavailable.
 */
export async function registerForPush() {
  try {
    await setupChannels()
    const current = await Notifications.getPermissionsAsync()
    const granted =
      current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted)
    if (!granted) return { ok: false, reason: 'permission' }
    if (!Device.isDevice) return { ok: false, reason: 'simulator' }
    if (isExpoGo && Platform.OS === 'android') return { ok: false, reason: 'expo-go' }

    const { data: token } = await Notifications.getDevicePushTokenAsync()
    await register(token)
    return { ok: true, reason: null }
  } catch (err) {
    return { ok: false, reason: err?.message ?? 'unavailable' }
  }
}

/** The OS can replace the token at any time; the backend must hear about it. */
export function onPushTokenChange() {
  const sub = Notifications.addPushTokenListener(({ data: token }) => {
    register(token).catch(() => undefined)
  })
  return () => sub.remove()
}

/**
 * Sign-out: stop this phone receiving the account's trip offers. Must run
 * before the session is dropped. Never throws.
 */
export async function unregisterPush() {
  try {
    const token =
      registeredToken ?? (Device.isDevice ? String((await Notifications.getDevicePushTokenAsync()).data) : null)
    if (token) await api.devices.unregister(token)
  } catch {
    // Offline, or no token was ever issued: nothing to remove.
  }
  registeredToken = null
}

export const isOfferPush = (notification) =>
  notification?.request?.content?.data?.type === 'TRIP_OFFER'

/**
 * Sound and vibration for an offer that arrived by polling rather than push.
 * Vibration alone is not enough with the phone on a dash mount.
 */
export async function alertNewOffer(offer) {
  Vibration.vibrate(OFFER_VIBRATION)
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'New trip request',
        body: offer?.pickup ? `Pickup: ${offer.pickup}` : 'A customer nearby is requesting a driver',
        sound: 'default',
        data: { type: 'TRIP_OFFER', trip_id: offer?.serverId, local: true },
      },
      trigger: Platform.OS === 'android' ? { channelId: OFFERS_CHANNEL } : null,
    })
  } catch {
    // No notification permission: the vibration above still fires.
  }
}

const REMIND_DAYS_BEFORE = [30, 7, 1]
const DOC_LABELS = {
  DRIVING_LICENCE: 'driving licence',
  AADHAAR: 'Aadhaar',
  POLICE_VERIFICATION: 'police verification',
  PHOTO: 'photo',
  ADDRESS_PROOF: 'address proof',
}

export const documentLabel = (kind) => DOC_LABELS[kind] ?? String(kind).toLowerCase().replace(/_/g, ' ')

/** Whole days from today until a YYYY-MM-DD date; negative once it has passed. */
export function daysUntil(dateOnly) {
  const [y, m, d] = String(dateOnly).split('-').map(Number)
  const today = new Date()
  const from = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((Date.UTC(y, m - 1, d) - from) / 86_400_000)
}

/**
 * Schedules local reminders 30, 7 and 1 day before each document expires, at
 * 9 am. Idempotent: earlier reminders for the same documents are replaced, so
 * it is safe to call every time the profile loads.
 */
export async function scheduleExpiryReminders(documents) {
  try {
    const { granted } = await Notifications.getPermissionsAsync()
    if (!granted) return
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith('doc-expiry-'))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    )

    for (const doc of documents) {
      if (!doc.expires_on || doc.status === 'REJECTED') continue
      const [y, m, d] = doc.expires_on.split('-').map(Number)
      for (const days of REMIND_DAYS_BEFORE) {
        const at = new Date(y, m - 1, d - days, 9, 0, 0)
        if (at.getTime() <= Date.now()) continue
        await Notifications.scheduleNotificationAsync({
          identifier: `doc-expiry-${doc.kind}-${days}`,
          content: {
            title: `Your ${documentLabel(doc.kind)} expires ${days === 1 ? 'tomorrow' : `in ${days} days`}`,
            body: 'Upload the renewed document in MyDriver Partner to keep receiving trips.',
            data: { type: 'DOCUMENT_EXPIRY', kind: doc.kind },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: at,
            channelId: REMINDERS_CHANNEL,
          },
        })
      }
    }
  } catch {
    // Reminders are a convenience; the Profile screen shows the same dates.
  }
}

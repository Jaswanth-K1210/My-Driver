import { useEffect, useRef } from 'react'
import { isRunningInExpoGo } from 'expo'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { NativeModules } from 'react-native'

/**
 * Silent SOS by pressing a volume button three times.
 *
 * The app cannot see the buttons themselves, only the volume changing, so:
 *  - it works while the live trip screen is open and the phone is unlocked,
 *    not with the screen off or the app in the background;
 *  - a press that does not change the volume (already at maximum or minimum)
 *    is not seen;
 *  - turning the volume up or down by three steps looks the same as an SOS.
 * For the last reason it is off until the customer switches it on in Profile,
 * and a trigger opens the same cancellable countdown as the SOS button.
 */
const PREF_KEY = 'mydriver.volumeSos'

const PRESSES = 3
// Holding a button down repeats much faster than this; separate presses are slower.
const MIN_GAP_MS = 180
const MAX_GAP_MS = 1200

export async function getVolumeSosEnabled() {
  try {
    return (await SecureStore.getItemAsync(PREF_KEY)) === '1'
  } catch {
    return false
  }
}

export async function setVolumeSosEnabled(enabled) {
  try {
    await SecureStore.setItemAsync(PREF_KEY, enabled ? '1' : '0')
    return true
  } catch {
    return false
  }
}

const isExpoGo =
  (typeof isRunningInExpoGo === 'function' && isRunningInExpoGo()) ||
  Constants.executionEnvironment === 'storeClient'

/** Loaded on first use: the native module is missing in Expo Go. */
function volumeManager() {
  if (isExpoGo || !NativeModules?.VolumeManager) return null
  try {
    return require('react-native-volume-manager').VolumeManager
  } catch {
    return null
  }
}

/** True when this build can listen for volume changes at all. */
export function volumeSosSupported() {
  const manager = volumeManager()
  if (!manager) return false
  try {
    manager.addVolumeListener(() => undefined).remove()
    return true
  } catch {
    return false
  }
}

/** Pure, so the timing rule can be reasoned about on its own. */
export function isTriplePress(times) {
  if (times.length < PRESSES) return false
  const last = times.slice(-PRESSES)
  for (let i = 1; i < last.length; i += 1) {
    const gap = last[i] - last[i - 1]
    if (gap < MIN_GAP_MS || gap > MAX_GAP_MS) return false
  }
  return true
}

/**
 * Calls `onTrigger` when the customer has switched the feature on and presses
 * a volume button three times. Does nothing when `active` is false.
 */
export function useTripleVolumePress(active, onTrigger) {
  const callback = useRef(onTrigger)
  useEffect(() => {
    callback.current = onTrigger
  })

  useEffect(() => {
    if (!active) return undefined
    let sub = null
    let cancelled = false
    const times = []

    getVolumeSosEnabled().then((enabled) => {
      if (!enabled || cancelled) return
      const manager = volumeManager()
      if (!manager) return
      try {
        sub = manager.addVolumeListener(() => {
          times.push(Date.now())
          if (times.length > PRESSES) times.shift()
          if (isTriplePress(times)) {
            times.length = 0
            callback.current?.()
          }
        })
      } catch {
        // No native module in this build (Expo Go). The SOS button still works.
      }
    })

    return () => {
      cancelled = true
      sub?.remove()
    }
  }, [active])
}

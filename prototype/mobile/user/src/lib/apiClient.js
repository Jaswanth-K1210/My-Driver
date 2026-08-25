import * as SecureStore from 'expo-secure-store'
import { createClient } from './api.js'
import { API_URL } from './config.js'

/**
 * Tokens go in the device keychain / keystore, not AsyncStorage: a refresh
 * token is a long-lived credential.
 *
 * SecureStore keys may only contain alphanumerics, ".", "-" and "_", so the
 * client's dotted key names are used as-is but sanitised defensively.
 */
const safeKey = (key) => key.replace(/[^A-Za-z0-9._-]/g, '_')

const secureStorage = {
  async get(key) {
    try {
      return await SecureStore.getItemAsync(safeKey(key))
    } catch {
      return null
    }
  },
  async set(key, value) {
    try {
      await SecureStore.setItemAsync(safeKey(key), value)
    } catch {
      // Simulators without a keychain still work; the session just won't persist.
    }
  },
  async remove(key) {
    try {
      await SecureStore.deleteItemAsync(safeKey(key))
    } catch {
      // Ignore.
    }
  },
}

export const api = createClient({ baseUrl: API_URL, storage: secureStorage })

export { ApiError } from './api.js'

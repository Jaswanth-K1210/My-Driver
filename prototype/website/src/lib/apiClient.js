import { createClient } from './api.js'
import { API_URL } from './config.js'

/** localStorage-backed storage. Private-mode browsers just lose persistence. */
const webStorage = {
  async get(key) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Ignore: the session simply will not survive a reload.
    }
  },
  async remove(key) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore.
    }
  },
}

export const api = createClient({ baseUrl: API_URL, storage: webStorage })

export { ApiError } from './api.js'

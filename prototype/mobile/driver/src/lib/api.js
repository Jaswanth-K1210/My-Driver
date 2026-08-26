/**
 * MyDriver API client — canonical source.
 *
 * This file is VENDORED into each app as `src/lib/api.js`:
 *   prototype/website/src/lib/api.js
 *   prototype/mobile/user/src/lib/api.js
 *   prototype/mobile/driver/src/lib/api.js
 *
 * Edit it HERE, then run `prototype/shared/sync.sh` to push the copies out.
 * It is duplicated rather than imported because neither Metro (Expo) nor Vite
 * resolves a module outside its own project root without extra config, and a
 * bundler-config problem would break all three apps at once.
 *
 * Plain JS with no imports on purpose: it must run unchanged in the browser
 * and in React Native. `fetch` and `WebSocket` are globals in both.
 *
 * Storage is injected rather than assumed, because the web uses localStorage
 * and React Native uses expo-secure-store.
 */

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const ACCESS_KEY = 'mydriver.access_token'
const REFRESH_KEY = 'mydriver.refresh_token'

/** In-memory fallback so the client still works if no storage is supplied. */
function memoryStorage() {
  const map = new Map()
  return {
    async get(k) {
      return map.has(k) ? map.get(k) : null
    },
    async set(k, v) {
      map.set(k, v)
    },
    async remove(k) {
      map.delete(k)
    },
  }
}

export function createClient({ baseUrl, storage, onAuthChange } = {}) {
  if (!baseUrl) throw new Error('createClient requires a baseUrl')

  const store = storage ?? memoryStorage()
  let accessToken = null
  let refreshToken = null
  let refreshing = null
  let loaded = false

  async function loadTokens() {
    if (loaded) return
    loaded = true
    accessToken = await store.get(ACCESS_KEY)
    refreshToken = await store.get(REFRESH_KEY)
  }

  async function setTokens(tokens) {
    accessToken = tokens?.access_token ?? null
    refreshToken = tokens?.refresh_token ?? null

    if (tokens) {
      await store.set(ACCESS_KEY, tokens.access_token)
      await store.set(REFRESH_KEY, tokens.refresh_token)
    } else {
      await store.remove(ACCESS_KEY)
      await store.remove(REFRESH_KEY)
    }
    onAuthChange?.(Boolean(tokens))
  }

  /** Collapses concurrent 401s into one refresh round trip. */
  function refreshOnce() {
    if (refreshing) return refreshing

    refreshing = (async () => {
      try {
        const res = await fetch(`${baseUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!res.ok) {
          await setTokens(null)
          return
        }
        await setTokens(await res.json())
      } catch {
        await setTokens(null)
      } finally {
        refreshing = null
      }
    })()

    return refreshing
  }

  async function request(path, options = {}) {
    await loadTokens()

    const send = async () => {
      const headers = { ...(options.headers ?? {}) }
      if (options.body !== undefined) headers['content-type'] = 'application/json'
      if (options.auth !== false && accessToken) headers.authorization = `Bearer ${accessToken}`

      return fetch(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
    }

    let res
    try {
      res = await send()
    } catch (err) {
      throw new ApiError(0, 'NETWORK_ERROR', `Cannot reach the server at ${baseUrl}`, String(err))
    }

    // One transparent retry on expiry; anything else is the caller's problem.
    if (res.status === 401 && options.auth !== false && refreshToken) {
      await refreshOnce()
      if (accessToken) res = await send()
    }

    if (res.status === 204) return undefined

    const text = await res.text()
    const payload = text ? JSON.parse(text) : undefined

    if (!res.ok) {
      const e = payload?.error
      throw new ApiError(
        res.status,
        e?.code ?? 'UNKNOWN',
        e?.message ?? `Request failed with ${res.status}`,
        e?.details,
      )
    }
    return payload
  }

  const storeAuth = async (result) => {
    await setTokens(result)
    return result
  }

  /* ── Realtime ───────────────────────────────────────────────────────── */

  function createRealtime({ onState } = {}) {
    let socket = null
    let closedByCaller = false
    let attempt = 0
    const subscriptions = new Set()
    const handlers = new Map()

    const emit = (frame) => {
      for (const h of handlers.get(frame.type) ?? []) h(frame)
      for (const h of handlers.get('*') ?? []) h(frame)
    }

    const send = (frame) => {
      if (socket && socket.readyState === 1) socket.send(JSON.stringify(frame))
    }

    async function connect() {
      closedByCaller = false
      onState?.('connecting')

      // Tickets are single use, so a fresh one is fetched on every attempt.
      const { ticket } = await request('/v1/realtime/ticket', { method: 'POST' })
      const wsUrl = baseUrl.replace(/^http/, 'ws')
      const ws = new WebSocket(`${wsUrl}/v1/integrity?ticket=${encodeURIComponent(ticket)}`)
      socket = ws

      await new Promise((resolve, reject) => {
        ws.onopen = () => {
          attempt = 0
          onState?.('open')
          for (const id of subscriptions) send({ type: 'SUBSCRIBE', trip_id: id })
          resolve()
        }
        ws.onerror = () => reject(new Error('WebSocket failed to open'))
      })

      ws.onmessage = (event) => {
        let frame
        try {
          frame = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (frame.type === 'PING') return send({ type: 'PONG' })
        emit(frame)
      }

      ws.onclose = () => {
        onState?.('closed')
        if (!closedByCaller) void reconnect()
      }
    }

    async function reconnect() {
      attempt += 1
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 30000) + Math.random() * 1000
      await new Promise((r) => setTimeout(r, backoff))
      if (closedByCaller) return
      try {
        await connect()
      } catch {
        void reconnect()
      }
    }

    return {
      connect,
      subscribe(tripId) {
        subscriptions.add(tripId)
        send({ type: 'SUBSCRIBE', trip_id: tripId })
      },
      unsubscribe(tripId) {
        subscriptions.delete(tripId)
        send({ type: 'UNSUBSCRIBE', trip_id: tripId })
      },
      sendDriverTelemetry(tripId, coords, sensors) {
        send({
          type: 'DRIVER_TELEMETRY',
          trip_id: tripId,
          timestamp: Date.now(),
          coords,
          ...(sensors ? { sensors } : {}),
        })
      },
      sendCustomerTelemetry(tripId, coords) {
        send({ type: 'CUSTOMER_TELEMETRY', trip_id: tripId, timestamp: Date.now(), coords })
      },
      on(type, handler) {
        let set = handlers.get(type)
        if (!set) {
          set = new Set()
          handlers.set(type, set)
        }
        set.add(handler)
        return () => set.delete(handler)
      },
      close() {
        closedByCaller = true
        socket?.close()
        socket = null
      },
      get isOpen() {
        return socket?.readyState === 1
      },
    }
  }

  /* ── Public surface ─────────────────────────────────────────────────── */

  return {
    baseUrl,
    request,

    async hasSession() {
      await loadTokens()
      return Boolean(accessToken)
    },

    auth: {
      requestOtp: (phone_number, role) =>
        request('/v1/auth/otp/request', {
          method: 'POST',
          body: { phone_number, role },
          auth: false,
        }),

      verifyOtp: async (phone_number, otp, role, device_id) =>
        storeAuth(
          await request('/v1/auth/otp/verify', {
            method: 'POST',
            body: { phone_number, otp, role, ...(device_id ? { device_id } : {}) },
            auth: false,
          }),
        ),

      google: async (id_token, role, device_id) =>
        storeAuth(
          await request('/v1/auth/google', {
            method: 'POST',
            body: { id_token, role, ...(device_id ? { device_id } : {}) },
            auth: false,
          }),
        ),

      logout: async () => {
        await loadTokens()
        if (refreshToken) {
          await request('/v1/auth/logout', {
            method: 'POST',
            body: { refresh_token: refreshToken },
            auth: false,
          }).catch(() => undefined)
        }
        await setTokens(null)
      },
    },

    me: {
      get: () => request('/v1/me'),
      update: (patch) => request('/v1/me', { method: 'PATCH', body: patch }),
      guardians: {
        list: () => request('/v1/me/guardians'),
        add: (input) => request('/v1/me/guardians', { method: 'POST', body: input }),
        update: (id, patch) => request(`/v1/me/guardians/${id}`, { method: 'PATCH', body: patch }),
        remove: (id) => request(`/v1/me/guardians/${id}`, { method: 'DELETE' }),
      },
      consents: {
        list: () => request('/v1/me/consents'),
        record: (purpose, version, granted) =>
          request('/v1/me/consents', { method: 'POST', body: { purpose, version, granted } }),
      },
    },

    catalogue: {
      rateCards: () => request('/v1/rate-cards', { auth: false }),
    },

    trips: {
      quote: (input) => request('/v1/trips/quote', { method: 'POST', body: input }),

      book: (input, idempotencyKey) =>
        request('/v1/trips/book', {
          method: 'POST',
          body: input,
          ...(idempotencyKey ? { headers: { 'idempotency-key': idempotencyKey } } : {}),
        }),

      get: (id) => request(`/v1/trips/${id}`),

      list: ({ cursor, limit } = {}) => {
        // Built by hand rather than with URLSearchParams: React Native only
        // partially polyfills it, and this must behave identically on both.
        const parts = []
        if (cursor) parts.push(`cursor=${encodeURIComponent(cursor)}`)
        if (limit) parts.push(`limit=${encodeURIComponent(String(limit))}`)
        const suffix = parts.length > 0 ? `?${parts.join('&')}` : ''
        return request(`/v1/trips${suffix}`)
      },

      cancel: (id, reason) =>
        request(`/v1/trips/${id}/cancel`, { method: 'POST', body: { reason } }),

      handshakeOtp: (id) => request(`/v1/trips/${id}/handshake-otp`, { method: 'POST' }),

      rate: (id, rating, comment) =>
        request(`/v1/trips/${id}/rate`, {
          method: 'POST',
          body: { rating, ...(comment ? { comment } : {}) },
        }),
    },

    driver: {
      /**
       * Pass `location` when going ONLINE: dispatch searches a geospatial
       * index, so a driver with no known position is not offered any trips.
       */
      setAvailability: (availability, location) =>
        request('/v1/driver/availability', {
          method: 'POST',
          body: { availability, ...(location ? { location } : {}) },
        }),

      summary: () => request('/v1/driver/summary'),

      /**
       * Offers this driver can still accept.
       *
       * TRIP_OFFER is published to the *trip* channel, but a driver is not a
       * trip participant until they accept — trips.driver_id stays NULL while
       * the offer is pending — so the gateway refuses their SUBSCRIBE and the
       * frame never reaches them. GET /v1/trips filters on driver_id too.
       * Polling this is the only way a pending offer reaches the driver app.
       */
      offers: () => request('/v1/driver/offers'),

      respondToOffer: (tripId, accept) =>
        request(`/v1/trips/${tripId}/offer/respond`, { method: 'POST', body: { accept } }),

      handshake: (tripId, driver_selfie_base64, otp) =>
        request(`/v1/trips/${tripId}/handshake`, {
          method: 'POST',
          body: { driver_selfie_base64, otp },
        }),

      complete: (tripId) => request(`/v1/trips/${tripId}/complete`, { method: 'POST' }),
    },

    realtime: createRealtime,
  }
}

import { Http, type TokenStore } from './http.js'
import { RealtimeConnection } from './ws.js'
import type {
  Availability,
  BookRequest,
  Consent,
  ConsentPurpose,
  DriverSummary,
  Guardian,
  Me,
  PublicUser,
  Quote,
  Role,
  Tokens,
  Trip,
} from './types.js'

export * from './types.js'
export { ApiError } from './http.js'
export { RealtimeConnection } from './ws.js'

export type ClientOptions = {
  baseUrl: string
  accessToken?: string | null
  refreshToken?: string | null
  /** Persist tokens (SecureStore on mobile, localStorage on web). */
  onTokens?: (tokens: Tokens | null) => void
}

type AuthResponse = Tokens & { user: PublicUser }

export function createClient(options: ClientOptions) {
  const tokens: TokenStore = {
    accessToken: options.accessToken ?? null,
    refreshToken: options.refreshToken ?? null,
  }
  const http = new Http({
    baseUrl: options.baseUrl,
    tokens,
    ...(options.onTokens ? { onTokens: options.onTokens } : {}),
  })

  const store = (res: AuthResponse): AuthResponse => {
    http.setTokens(res)
    return res
  }

  return {
    http,

    auth: {
      /** Sends a 6-digit SMS code. `role` scopes the resulting session. */
      requestOtp: (phone_number: string, role: Role) =>
        http.request<{ status: 'OTP_SENT'; expires_in: number }>('/v1/auth/otp/request', {
          method: 'POST',
          body: { phone_number, role },
          auth: false,
        }),

      verifyOtp: async (phone_number: string, otp: string, role: Role, device_id?: string) =>
        store(
          await http.request<AuthResponse>('/v1/auth/otp/verify', {
            method: 'POST',
            body: { phone_number, otp, role, ...(device_id ? { device_id } : {}) },
            auth: false,
          }),
        ),

      google: async (id_token: string, role: Role, device_id?: string) =>
        store(
          await http.request<AuthResponse>('/v1/auth/google', {
            method: 'POST',
            body: { id_token, role, ...(device_id ? { device_id } : {}) },
            auth: false,
          }),
        ),

      logout: async () => {
        if (tokens.refreshToken) {
          await http.request<void>('/v1/auth/logout', {
            method: 'POST',
            body: { refresh_token: tokens.refreshToken },
            auth: false,
          })
        }
        http.setTokens(null)
      },
    },

    me: {
      get: () => http.request<Me>('/v1/me'),
      update: (patch: { full_name?: string; email?: string }) =>
        http.request<Me>('/v1/me', { method: 'PATCH', body: patch }),

      guardians: {
        list: () => http.request<Guardian[]>('/v1/me/guardians'),
        add: (input: { name: string; relation?: string; phone: string }) =>
          http.request<Guardian>('/v1/me/guardians', { method: 'POST', body: input }),
        update: (id: string, patch: { name?: string; relation?: string; phone?: string }) =>
          http.request<Guardian>(`/v1/me/guardians/${id}`, { method: 'PATCH', body: patch }),
        remove: (id: string) =>
          http.request<void>(`/v1/me/guardians/${id}`, { method: 'DELETE' }),
      },

      consents: {
        list: () => http.request<Consent[]>('/v1/me/consents'),
        record: (purpose: ConsentPurpose, version: string, granted: boolean) =>
          http.request<Consent>('/v1/me/consents', {
            method: 'POST',
            body: { purpose, version, granted },
          }),
      },
    },

    trips: {
      quote: (input: Omit<BookRequest, 'speed_ceiling_kmh'>) =>
        http.request<Quote>('/v1/trips/quote', { method: 'POST', body: input }),

      /** Pass an idempotencyKey so a retried booking cannot create two trips. */
      book: (input: BookRequest, idempotencyKey?: string) =>
        http.request<Trip>('/v1/trips/book', {
          method: 'POST',
          body: input,
          ...(idempotencyKey ? { headers: { 'idempotency-key': idempotencyKey } } : {}),
        }),

      get: (id: string) => http.request<Trip>(`/v1/trips/${id}`),

      list: (params: { cursor?: string; limit?: number } = {}) => {
        const q = new URLSearchParams()
        if (params.cursor) q.set('cursor', params.cursor)
        if (params.limit) q.set('limit', String(params.limit))
        const suffix = q.toString() ? `?${q}` : ''
        return http.request<{ items: Trip[]; next_cursor: string | null }>(`/v1/trips${suffix}`)
      },

      cancel: (id: string, reason: string) =>
        http.request<Trip>(`/v1/trips/${id}/cancel`, { method: 'POST', body: { reason } }),

      /** Customer-only: the 4-digit code to read aloud to the driver. */
      handshakeOtp: (id: string) =>
        http.request<{ otp: string }>(`/v1/trips/${id}/handshake-otp`, { method: 'POST' }),

      rate: (id: string, rating: number, comment?: string) =>
        http.request<{ rating: number; driver_rating: number }>(`/v1/trips/${id}/rate`, {
          method: 'POST',
          body: { rating, ...(comment ? { comment } : {}) },
        }),
    },

    driver: {
      setAvailability: (availability: Availability) =>
        http.request<{ availability: Availability }>('/v1/driver/availability', {
          method: 'POST',
          body: { availability },
        }),

      summary: () => http.request<DriverSummary>('/v1/driver/summary'),

      respondToOffer: (tripId: string, accept: boolean) =>
        http.request<Trip>(`/v1/trips/${tripId}/offer/respond`, {
          method: 'POST',
          body: { accept },
        }),

      handshake: (tripId: string, driver_selfie_base64: string, otp: string) =>
        http.request<{ status: 'HANDSHAKE_PASSED'; trip_state: 'IN_TRIP' }>(
          `/v1/trips/${tripId}/handshake`,
          { method: 'POST', body: { driver_selfie_base64, otp } },
        ),

      complete: (tripId: string) =>
        http.request<Trip>(`/v1/trips/${tripId}/complete`, { method: 'POST' }),
    },

    realtime: {
      connect: async (onStateChange?: (s: 'connecting' | 'open' | 'closed') => void) => {
        const conn = new RealtimeConnection({
          baseUrl: options.baseUrl,
          http,
          ...(onStateChange ? { onStateChange } : {}),
        })
        await conn.connect()
        return conn
      },
    },
  }
}

export type MyDriverClient = ReturnType<typeof createClient>

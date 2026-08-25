import type { Tokens } from './types.js'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export type TokenStore = {
  accessToken: string | null
  refreshToken: string | null
}

export type HttpOptions = {
  baseUrl: string
  tokens: TokenStore
  /** Called whenever tokens change, so the app can persist them. */
  onTokens?: (tokens: Tokens | null) => void
}

type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  auth?: boolean
}

/**
 * Uses the global fetch, so this module works unchanged in the browser and in
 * React Native. Do not import any Node-only API here.
 */
export class Http {
  private refreshing: Promise<void> | null = null

  constructor(private readonly opts: HttpOptions) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const send = async (): Promise<Response> => {
      const headers: Record<string, string> = { ...options.headers }
      if (options.body !== undefined) headers['content-type'] = 'application/json'
      if (options.auth !== false && this.opts.tokens.accessToken) {
        headers.authorization = `Bearer ${this.opts.tokens.accessToken}`
      }

      return fetch(`${this.opts.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
    }

    let res = await send()

    // One transparent retry on expiry. Anything else is the caller's problem.
    if (res.status === 401 && options.auth !== false && this.opts.tokens.refreshToken) {
      await this.refreshOnce()
      if (this.opts.tokens.accessToken) res = await send()
    }

    if (res.status === 204) return undefined as T
    const text = await res.text()
    const payload = text ? (JSON.parse(text) as unknown) : undefined

    if (!res.ok) {
      const envelope = payload as { error?: { code: string; message: string; details?: unknown } }
      throw new ApiError(
        res.status,
        envelope?.error?.code ?? 'UNKNOWN',
        envelope?.error?.message ?? `Request failed with ${res.status}`,
        envelope?.error?.details,
      )
    }

    return payload as T
  }

  /** Collapses concurrent 401s into a single refresh round trip. */
  private refreshOnce(): Promise<void> {
    if (this.refreshing) return this.refreshing

    this.refreshing = (async () => {
      try {
        const res = await fetch(`${this.opts.baseUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh_token: this.opts.tokens.refreshToken }),
        })
        if (!res.ok) {
          this.setTokens(null)
          return
        }
        this.setTokens((await res.json()) as Tokens)
      } finally {
        this.refreshing = null
      }
    })()

    return this.refreshing
  }

  setTokens(tokens: Tokens | null): void {
    this.opts.tokens.accessToken = tokens?.access_token ?? null
    this.opts.tokens.refreshToken = tokens?.refresh_token ?? null
    this.opts.onTokens?.(tokens)
  }
}

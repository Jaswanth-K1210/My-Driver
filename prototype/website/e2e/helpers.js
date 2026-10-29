import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test as base, expect } from '@playwright/test'

export const API = 'http://localhost:4000'
export const CONSOLE = 'http://localhost:5174'
export const API_LOG = new URL('./.api.log', import.meta.url)
export const STAFF_FILE = new URL('./.staff.json', import.meta.url)

/**
 * A fresh Indian mobile number per call: the API allows 3 OTPs per phone per
 * 15 minutes, and a new number is also a new account, so tests never share state.
 */
let seq = 0
export const newPhone = () => `9${String(Date.now()).slice(-7)}${String(seq++ % 100).padStart(2, '0')}`

/** The console SMS provider prints every OTP to the API log (playwright.config.js). */
export async function otpFor(phone) {
  for (let i = 0; i < 50; i++) {
    const hits = [...readFileSync(API_LOG, 'utf8').matchAll(new RegExp(`\\+91${phone}: .*?\\b(\\d{6})\\b`, 'g'))]
    if (hits.length) return hits.at(-1)[1]
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`no OTP for ${phone} in the API log`)
}

async function call(request, method, path, token, data, headers = {}) {
  const res = await request.fetch(`${API}${path}`, {
    method,
    data,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  })
  const body = await res.json().catch(() => null)
  return { status: res.status(), body }
}

const BACKEND = fileURLToPath(new URL('../../backend', import.meta.url))

/**
 * Every test signs in from 127.0.0.1, and the API allows 10 OTPs per network
 * an hour and 5 staff logins per account in 15 minutes. Reset the counters in
 * the local Redis rather than weaken the limits in the backend.
 */
function resetLoginQuota() {
  execFileSync('docker', [
    'compose', 'exec', '-T', 'redis', 'redis-cli', 'EVAL',
    "for _, k in ipairs(redis.call('KEYS', 'quota:*')) do redis.call('DEL', k) end",
    '0',
  ], { cwd: BACKEND, stdio: 'ignore' })
}

/** Real OTP login through the API. Returns the tokens the website stores. */
export async function login(request, phone, role = 'CUSTOMER') {
  resetLoginQuota()
  const sent = await call(request, 'POST', '/v1/auth/otp/request', null, { phone_number: `+91${phone}`, role })
  expect(sent.status, JSON.stringify(sent.body)).toBe(200)
  const res = await call(request, 'POST', '/v1/auth/otp/verify', null, {
    phone_number: `+91${phone}`,
    otp: await otpFor(phone),
    role,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return { token: res.body.access_token, refresh: res.body.refresh_token, userId: res.body.user.id }
}

export const staffAccount = (role) => JSON.parse(readFileSync(STAFF_FILE, 'utf8'))[role]

export async function staffLogin(request, role) {
  const { email, password } = staffAccount(role)
  resetLoginQuota()
  // Staff login is accepted only from the console's origin.
  const res = await call(request, 'POST', '/v1/auth/staff/login', null, { email, password }, { origin: CONSOLE })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return { token: res.body.access_token, refresh: res.body.refresh_token, userId: res.body.user.id, email, password }
}

/** Opens the site already signed in, the way a returning visitor arrives. */
export async function signIn(page, { token, refresh }) {
  await page.addInitScript(
    ([a, r]) => {
      localStorage.setItem('mydriver.access_token', a)
      localStorage.setItem('mydriver.refresh_token', r)
    },
    [token, refresh],
  )
}

export const api = (request, token) => ({
  get: (path) => call(request, 'GET', path, token),
  post: (path, data = {}) => call(request, 'POST', path, token, data),
  patch: (path, data = {}) => call(request, 'PATCH', path, token, data),
})

/** Poll until `fn` returns something truthy. */
export async function until(fn, what, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const v = await fn()
    if (v) return v
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`timed out waiting for ${what}`)
}

// Development auto-approves a driver with every certification, so a fresh
// login can take any trip once it is online with a position.
export const HITEC_CITY = { lat: 17.4504, lng: 78.3808 }
const SELFIE = Buffer.from('e2e-driver-selfie').toString('base64')

export async function onlineDriver(request, at = HITEC_CITY) {
  const phone = newPhone()
  const d = await login(request, phone, 'DRIVER')
  const driver = api(request, d.token)
  const online = await driver.post('/v1/driver/availability', { availability: 'ONLINE', location: at })
  expect(online.body?.dispatchable).toBe(true)

  return {
    ...d,
    phone,
    api: driver,
    offline: () => driver.post('/v1/driver/availability', { availability: 'OFFLINE' }),
    /** Waits for an offer and returns its trip id, without answering it. */
    offered: async () => (await until(async () => (await driver.get('/v1/driver/offers')).body?.[0], 'an offer')).trip_id,
    async accept() {
      const offer = await until(async () => (await driver.get('/v1/driver/offers')).body?.[0], 'an offer')
      const res = await driver.post(`/v1/trips/${offer.trip_id}/offer/respond`, { accept: true })
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      return offer.trip_id
    },
    /** One fix at the pickup: the integrity pass marks the arrival within ~3 s. */
    async arrive(tripId) {
      const { body: trip } = await driver.get(`/v1/trips/${tripId}`)
      const now = Date.now()
      const res = await driver.post(`/v1/trips/${tripId}/telemetry`, {
        sent_at: now,
        points: [{ timestamp: now, coords: { lat: trip.pickup.lat, lng: trip.pickup.lng, speed: 0 } }],
      })
      expect(res.status, JSON.stringify(res.body)).toBe(202)
      await until(async () => (await driver.get(`/v1/trips/${tripId}`)).body?.arrived_at, 'the arrival')
    },
    async start(tripId, otp) {
      const res = await driver.post(`/v1/trips/${tripId}/handshake`, { driver_selfie_base64: SELFIE, otp })
      expect(res.status, JSON.stringify(res.body)).toBe(200)
    },
    async complete(tripId) {
      const res = await driver.post(`/v1/trips/${tripId}/complete`)
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      return res.body
    },
  }
}

/** Books the default within-city trip on the website and approves the mock checkout. */
export async function bookAndPay(page) {
  await page.goto('/app/book')
  await page.getByRole('button', { name: 'Book a driver' }).click()
  await page.waitForURL(/\/app\/track/)
  const [checkout] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Pay securely' }).click(),
  ])
  await checkout.getByRole('button', { name: 'Approve test payment' }).click()
  await expect(checkout.getByText('Payment confirmed')).toBeVisible()
  await checkout.close()
}

export { expect }

export const test = base.extend({
  /** A new customer, signed in on `page`. */
  customer: async ({ page, request }, provide) => {
    const c = await login(request, newPhone())
    await signIn(page, c)
    await provide({ ...c, api: api(request, c.token) })
  },
  /** Call to put a driver online; every driver goes offline after the test, pass or fail. */
  driver: async ({ request }, provide) => {
    const made = []
    await provide(async (at) => {
      const d = await onlineDriver(request, at)
      made.push(d)
      return d
    })
    for (const d of made) await d.offline()
  },
  /** API client signed in as a staff role. */
  staff: async ({ request }, provide) => {
    await provide(async (role) => {
      const s = await staffLogin(request, role)
      return { ...s, api: api(request, s.token) }
    })
  },
  /** Opens the console signed in as a staff role, in its own browser context. */
  consolePage: async ({ browser, request }, provide) => {
    const contexts = []
    await provide(async (role) => {
      const ctx = await browser.newContext({ baseURL: CONSOLE })
      contexts.push(ctx)
      const page = await ctx.newPage()
      await signIn(page, await staffLogin(request, role))
      return page
    })
    for (const ctx of contexts) await ctx.close()
  },
})

#!/usr/bin/env node
/**
 * Companion backend & simulated-driver controller for Customer App Maestro E2E flows.
 *
 * Adapted from `prototype/website/e2e/helpers.js` (Jaswanth's Playwright helpers)
 * so the customer mobile app (`prototype/mobile/user`) can run all 6 critical
 * Layer 3 Maestro E2E flows (`docs/testing-plan.md` §6) without needing a second
 * physical phone or emulator running the Driver App simultaneously.
 *
 * Usage (companion HTTP bridge for automated Maestro runs):
 *   node prototype/mobile/user/e2e/driver-sim.mjs serve
 *
 * Usage (step-by-step CLI):
 *   node prototype/mobile/user/e2e/driver-sim.mjs reset-quota
 *   node prototype/mobile/user/e2e/driver-sim.mjs otp --phone 9876543210
 *   node prototype/mobile/user/e2e/driver-sim.mjs driver-online
 *   node prototype/mobile/user/e2e/driver-sim.mjs approve-payment --phone 9876543210
 *   node prototype/mobile/user/e2e/driver-sim.mjs driver-accept
 *   node prototype/mobile/user/e2e/driver-sim.mjs driver-arrive
 *   node prototype/mobile/user/e2e/driver-sim.mjs driver-start [--otp 1234]
 *   node prototype/mobile/user/e2e/driver-sim.mjs driver-complete
 *   node prototype/mobile/user/e2e/driver-sim.mjs autopilot full-trip --phone 9876543210
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = resolve(__dirname, '../../../backend')
const STATE_FILE = resolve(__dirname, '.e2e-state.json')

const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '')
const BRIDGE_PORT = Number(process.env.E2E_BRIDGE_PORT || 4099)
const DEFAULT_PHONE = process.env.CUSTOMER_PHONE || '9876543210'

// Cyber Towers, HITEC City (matches DEFAULT_CONFIG pickup in HomeScreen.jsx)
const HITEC_CITY = { lat: 17.4504, lng: 78.3808 }
const SELFIE_BASE64 = Buffer.from('e2e-driver-selfie').toString('base64')

const LOG_CANDIDATES = [
  process.env.API_LOG,
  resolve(__dirname, '.api.log'),
  resolve(__dirname, '../../../website/e2e/.api.log'),
  resolve(__dirname, '../../../backend/.api.log'),
].filter(Boolean)

function resolveApiLog() {
  for (const candidate of LOG_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return LOG_CANDIDATES[0]
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    }
  } catch {
    // Ignore corrupted state file
  }
  return {}
}

function saveState(patch) {
  const next = { ...loadState(), ...patch, updatedAt: new Date().toISOString() }
  writeFileSync(STATE_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

let seq = 0
function newPhone() {
  return `9${String(Date.now()).slice(-7)}${String(seq++ % 100).padStart(2, '0')}`
}

function normalizePhone10(raw = DEFAULT_PHONE) {
  const digits = String(raw).replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

/**
 * Clears `quota:*` keys in the local Docker Redis so repeated E2E runs from
 * 127.0.0.1 / 10.0.2.2 never trip the 10-OTP/hour network rate limit.
 */
export function resetLoginQuota() {
  try {
    execFileSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'redis',
        'redis-cli',
        'EVAL',
        "for _, k in ipairs(redis.call('KEYS', 'quota:*')) do redis.call('DEL', k) end",
        '0',
      ],
      { cwd: BACKEND_DIR, stdio: 'ignore' },
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, warning: `Redis quota reset skipped (${err.message})` }
  }
}

/**
 * Queries the local Docker Postgres container when running against the desk
 * backend. Used as a zero-auth fallback to discover the latest trip/payment ID
 * when the customer signed in directly on the mobile emulator.
 */
function queryLocalPostgres(sql) {
  try {
    const out = execFileSync(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'mydriver', '-d', 'mydriver', '-t', '-A', '-c', sql],
      { cwd: BACKEND_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return out.trim()
  } catch {
    return ''
  }
}

/**
 * Reads the most recent 6-digit login OTP for `+91<phone>` from the backend log.
 */
export async function otpFor(rawPhone = DEFAULT_PHONE, timeoutMs = 10_000) {
  const phone = normalizePhone10(rawPhone)
  if (process.env.OTP_CODE && /^\d{6}$/.test(process.env.OTP_CODE)) {
    return process.env.OTP_CODE
  }
  const logPath = resolveApiLog()
  const deadline = Date.now() + timeoutMs
  const pattern = new RegExp(`\\+91${phone}: .*?\\b(\\d{6})\\b`, 'g')

  while (Date.now() < deadline) {
    if (logPath && existsSync(logPath)) {
      const content = readFileSync(logPath, 'utf8')
      const hits = [...content.matchAll(pattern)]
      if (hits.length > 0) {
        return hits.at(-1)[1]
      }
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(
    `No 6-digit OTP found for +91${phone} in ${logPath}. ` +
      `Pipe backend stdout to ${resolve(__dirname, '.api.log')} or set API_LOG / OTP_CODE.`,
  )
}

async function apiCall(method, path, token = null, body = undefined) {
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status} on ${method} ${path}`
    const err = new Error(msg)
    err.status = res.status
    err.code = data?.error?.code
    err.body = data
    throw err
  }
  return data
}

async function until(fn, description, timeoutMs = 20_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const val = await fn()
      if (val) return val
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    `Timed out waiting for ${description}${lastErr ? ` (last error: ${lastErr.message})` : ''}`,
  )
}

/**
 * Mints a session via `/v1/auth/otp/request` + `/v1/auth/otp/verify`.
 * Note: the backend issues stateless JWT access tokens, so creating a helper
 * session for the customer phone does NOT invalidate the mobile app's token.
 */
export async function loginWithOtp(rawPhone, role = 'CUSTOMER') {
  const phone = normalizePhone10(rawPhone)
  resetLoginQuota()
  await apiCall('POST', '/v1/auth/otp/request', null, {
    phone_number: `+91${phone}`,
    role,
  })
  const otp = await otpFor(phone)
  const verified = await apiCall('POST', '/v1/auth/otp/verify', null, {
    phone_number: `+91${phone}`,
    otp,
    role,
  })
  return {
    phone,
    role,
    token: verified.access_token,
    refresh: verified.refresh_token,
    userId: verified.user.id,
  }
}

export async function ensureCustomerSession(rawPhone = DEFAULT_PHONE) {
  const phone = normalizePhone10(rawPhone)
  const state = loadState()
  if (state.customer?.phone === phone && state.customer?.token) {
    try {
      await apiCall('GET', '/v1/me', state.customer.token)
      return state.customer
    } catch {
      // Token expired; re-login below
    }
  }
  const customer = await loginWithOtp(phone, 'CUSTOMER')
  saveState({ customer })
  return customer
}

/**
 * Logs in a fresh driver and sets them ONLINE at Cyber Towers (`17.4504, 78.3808`).
 */
export async function driverOnline(at = HITEC_CITY) {
  const phone = newPhone()
  const session = await loginWithOtp(phone, 'DRIVER')
  const avail = await apiCall('POST', '/v1/driver/availability', session.token, {
    availability: 'ONLINE',
    location: at,
  })
  const driver = { ...session, location: at, dispatchable: avail.dispatchable }
  saveState({ driver })
  return driver
}

async function ensureDriverSession() {
  const state = loadState()
  if (state.driver?.token) return state.driver
  return driverOnline()
}

/**
 * Finds the active/latest trip and approves its mock payment hold via
 * `POST /v1/payments/:paymentId/mock/approve`.
 * Also ensures a driver is ONLINE so dispatch matches immediately.
 */
export async function approveLatestPayment({ tripId, phone = DEFAULT_PHONE } = {}) {
  const state = loadState()
  if (!state.driver?.token) {
    await driverOnline()
  }

  let resolvedTripId = tripId || state.activeTripId || null
  let paymentId = null

  // 1. Fast path via local Postgres (no extra OTP needed if desk Docker is running)
  if (!paymentId) {
    const cleanPhone = normalizePhone10(phone)
    const row = queryLocalPostgres(
      `SELECT p.id, p.trip_id
         FROM payments p
         JOIN trips t ON t.id = p.trip_id
         JOIN users u ON u.id = t.customer_id
        WHERE u.phone_number = '+91${cleanPhone}'
          AND p.status = 'CREATED'
        ORDER BY p.created_at DESC
        LIMIT 1`,
    )
    if (row && row.includes('|')) {
      const [pId, tId] = row.split('|')
      paymentId = pId
      resolvedTripId = tId
    }
  }

  // 2. Fallback via customer API session (`/v1/trips` + `/v1/trips/:id/payment`)
  if (!paymentId) {
    const customer = await ensureCustomerSession(phone)
    if (!resolvedTripId) {
      const found = await until(
        async () => {
          const list = await apiCall('GET', '/v1/trips?limit=5', customer.token)
          return list?.items?.find((t) => t.status === 'REQUESTED') || list?.items?.[0]
        },
        'customer REQUESTED trip',
        10_000,
      )
      resolvedTripId = found.id
    }
    const payRes = await apiCall('GET', `/v1/trips/${resolvedTripId}/payment`, customer.token)
    paymentId = payRes?.payment?.id
  }

  if (!paymentId) {
    throw new Error(`Could not locate a pending payment for phone ${phone}`)
  }

  const approved = await apiCall('POST', `/v1/payments/${paymentId}/mock/approve`, null, {})
  saveState({ activeTripId: resolvedTripId, lastPaymentId: paymentId })
  return { tripId: resolvedTripId, paymentId, status: approved?.status || 'AUTHORIZED' }
}

/**
 * Polls `/v1/driver/offers` for the online driver and accepts the first offer.
 */
export async function driverAccept() {
  const driver = await ensureDriverSession()
  const offer = await until(
    async () => {
      const offers = await apiCall('GET', '/v1/driver/offers', driver.token)
      return Array.isArray(offers) ? offers[0] : null
    },
    'a pending driver trip offer',
    20_000,
  )
  const trip = await apiCall('POST', `/v1/trips/${offer.trip_id}/offer/respond`, driver.token, {
    accept: true,
  })
  saveState({ activeTripId: offer.trip_id })
  return { tripId: offer.trip_id, status: trip.status }
}

/**
 * Sends a single telemetry fix at the pickup coordinates and waits for the
 * backend integrity engine to set `arrived_at` (~1-3 seconds).
 */
export async function driverArrive({ tripId } = {}) {
  const state = loadState()
  const driver = await ensureDriverSession()
  const id = tripId || state.activeTripId
  if (!id) throw new Error('No activeTripId in state; run driver-accept first or pass --trip <id>')

  const trip = await apiCall('GET', `/v1/trips/${id}`, driver.token)
  const now = Date.now()
  await apiCall('POST', `/v1/trips/${id}/telemetry`, driver.token, {
    sent_at: now,
    points: [
      {
        timestamp: now,
        coords: { lat: trip.pickup.lat, lng: trip.pickup.lng, speed: 0 },
      },
    ],
  })

  const arrivedTrip = await until(
    async () => {
      const latest = await apiCall('GET', `/v1/trips/${id}`, driver.token)
      return latest?.arrived_at ? latest : null
    },
    'trip.arrived_at to be set',
    15_000,
  )

  return { tripId: id, arrivedAt: arrivedTrip.arrived_at, status: arrivedTrip.status }
}

/**
 * Starts the trip (`POST /v1/trips/:id/handshake`) using either an explicit
 * 4-digit `--otp` or by issuing/fetching the customer's handshake OTP.
 */
export async function driverStart({ tripId, otp, phone = DEFAULT_PHONE } = {}) {
  const state = loadState()
  const driver = await ensureDriverSession()
  const id = tripId || state.activeTripId
  if (!id) throw new Error('No activeTripId in state; run driver-accept first or pass --trip <id>')

  let code = otp
  if (!code) {
    const customer = await ensureCustomerSession(phone)
    const res = await apiCall('POST', `/v1/trips/${id}/handshake-otp`, customer.token, {})
    code = res.otp
  }

  const started = await apiCall('POST', `/v1/trips/${id}/handshake`, driver.token, {
    driver_selfie_base64: SELFIE_BASE64,
    otp: String(code),
  })
  return { tripId: id, otp: String(code), ...started }
}

/**
 * Completes the active trip (`POST /v1/trips/:id/complete`) and takes the driver offline.
 */
export async function driverComplete({ tripId } = {}) {
  const state = loadState()
  const driver = await ensureDriverSession()
  const id = tripId || state.activeTripId
  if (!id) throw new Error('No activeTripId in state; run driver-accept first or pass --trip <id>')

  const completed = await apiCall('POST', `/v1/trips/${id}/complete`, driver.token, {})
  await apiCall('POST', '/v1/driver/availability', driver.token, {
    availability: 'OFFLINE',
  }).catch(() => undefined)
  return { tripId: id, status: completed.status, fareAmount: completed.fare_amount }
}

/**
 * Runs a background autopilot loop for a scenario (`full-trip`, `match-arrive`,
 * `cancel-before-arrival`, `cancel-after-arrival`).
 */
export async function runAutopilot(scenario = 'full-trip', phone = DEFAULT_PHONE) {
  console.log(`[autopilot] Starting scenario="${scenario}" for customer +91${normalizePhone10(phone)}`)
  resetLoginQuota()
  await driverOnline()
  console.log('[autopilot] Driver is ONLINE at Cyber Towers, HITEC City')

  const payment = await until(
    () => approveLatestPayment({ phone }).catch(() => null),
    'customer to book a trip requiring payment hold approval',
    120_000,
    1_000,
  )
  console.log(`[autopilot] Approved payment hold (${payment.paymentId}) for trip ${payment.tripId}`)

  const accepted = await driverAccept()
  console.log(`[autopilot] Driver accepted offer for trip ${accepted.tripId}`)

  if (scenario === 'cancel-before-arrival') {
    console.log('[autopilot] Stopping at HANDSHAKE_PENDING (pre-arrival) so customer can test free cancel.')
    return accepted
  }

  const arrived = await driverArrive({ tripId: accepted.tripId })
  console.log(`[autopilot] Driver arrived at pickup (${arrived.arrivedAt})`)

  if (scenario === 'match-arrive' || scenario === 'cancel-after-arrival') {
    console.log(`[autopilot] Stopping at DRIVER_ARRIVED for scenario="${scenario}".`)
    return arrived
  }

  // Wait briefly so Maestro Flow 04 can assert the pickup OTP card before starting trip
  await new Promise((r) => setTimeout(r, 4_000))
  const started = await driverStart({ tripId: accepted.tripId, phone })
  console.log(`[autopilot] Handshake verified with OTP ${started.otp}; trip is IN_TRIP`)

  await new Promise((r) => setTimeout(r, 4_000))
  const done = await driverComplete({ tripId: accepted.tripId })
  console.log(`[autopilot] Trip ${done.tripId} COMPLETED (fare ₹${done.fareAmount})`)
  return done
}

/**
 * Starts the local HTTP bridge server on `http://127.0.0.1:4099` so Maestro's
 * `runScript` files (`scripts/*.js`) can trigger driver actions synchronously.
 */
function startBridgeServer(port = BRIDGE_PORT) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
    const send = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    }

    try {
      let body = {}
      if (req.method === 'POST') {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const raw = Buffer.concat(chunks).toString('utf8')
        if (raw) body = JSON.parse(raw)
      }

      const phone = url.searchParams.get('phone') || body.phone || DEFAULT_PHONE
      const tripId = url.searchParams.get('tripId') || body.tripId || undefined

      if (url.pathname === '/health') {
        return send(200, { ok: true, apiUrl: API_URL })
      }
      if (url.pathname === '/reset-quota') {
        return send(200, resetLoginQuota())
      }
      if (url.pathname === '/otp') {
        const otp = await otpFor(phone)
        const digits = otp.split('')
        return send(200, {
          otp,
          d1: digits[0],
          d2: digits[1],
          d3: digits[2],
          d4: digits[3],
          d5: digits[4],
          d6: digits[5],
        })
      }
      if (url.pathname === '/driver-online') {
        const d = await driverOnline()
        return send(200, { ok: true, driverPhone: d.phone, dispatchable: d.dispatchable })
      }
      if (url.pathname === '/approve-payment') {
        const out = await approveLatestPayment({ tripId, phone })
        return send(200, { ok: true, ...out })
      }
      if (url.pathname === '/driver-accept') {
        const out = await driverAccept()
        return send(200, { ok: true, ...out })
      }
      if (url.pathname === '/driver-arrive') {
        const out = await driverArrive({ tripId })
        return send(200, { ok: true, ...out })
      }
      if (url.pathname === '/driver-start') {
        const otp = url.searchParams.get('otp') || body.otp || undefined
        const out = await driverStart({ tripId, otp, phone })
        return send(200, { ok: true, ...out })
      }
      if (url.pathname === '/driver-complete') {
        const out = await driverComplete({ tripId })
        return send(200, { ok: true, ...out })
      }

      return send(404, { error: `Unknown bridge route ${url.pathname}` })
    } catch (err) {
      console.error(`[bridge] Error on ${req.method} ${url.pathname}:`, err.message)
      return send(500, { ok: false, error: err.message })
    }
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`[driver-sim] Maestro E2E bridge listening on http://127.0.0.1:${port} (API: ${API_URL})`)
  })
}

function parseFlags(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(arg)
    }
  }
  return { cmd: positional[0], sub: positional[1], flags }
}

function printHelp() {
  console.log(`Usage: node prototype/mobile/user/e2e/driver-sim.mjs <command> [options]

Commands:
  serve                         Start local HTTP bridge on 127.0.0.1:${BRIDGE_PORT} for Maestro runScript hooks
  reset-quota                   Clear quota:* rate-limit keys in local Docker Redis
  otp [--phone <10-digit>]      Print latest 6-digit login OTP from backend log
  driver-online                 Sign in a fresh certified driver and go ONLINE at Cyber Towers
  approve-payment [--phone <p>] Approve the pending mock payment hold for the customer's trip
  driver-accept                 Accept the pending trip offer as the online driver
  driver-arrive [--trip <id>]   Send pickup GPS telemetry and wait for DRIVER_ARRIVED
  driver-start [--otp <4-dig>]  Complete pickup selfie + OTP handshake (starts trip -> IN_TRIP)
  driver-complete [--trip <id>] Complete the active trip (-> COMPLETED) and go OFFLINE
  autopilot <scenario>          Run automated driver lifecycle:
                                  full-trip | match-arrive | cancel-before-arrival | cancel-after-arrival

Environment variables:
  API_URL          Backend base URL (default: http://localhost:4000)
  API_LOG          Path to backend stdout log containing [OTP] lines
  CUSTOMER_PHONE   Default 10-digit customer phone (default: 9876543210)
  OTP_CODE         Override 6-digit login OTP (for staging/manual runs)
  E2E_BRIDGE_PORT  Local bridge port for Maestro scripts (default: 4099)`)
}

async function main() {
  const { cmd, sub, flags } = parseFlags(process.argv.slice(2))
  if (!cmd || cmd === 'help' || flags.help) {
    printHelp()
    return
  }

  const phone = flags.phone || DEFAULT_PHONE
  const tripId = flags.trip || undefined

  switch (cmd) {
    case 'serve':
      startBridgeServer(Number(flags.port || BRIDGE_PORT))
      break
    case 'reset-quota':
      console.log(JSON.stringify(resetLoginQuota()))
      break
    case 'otp': {
      const code = await otpFor(phone)
      if (flags.json) {
        const d = code.split('')
        console.log(JSON.stringify({ otp: code, d1: d[0], d2: d[1], d3: d[2], d4: d[3], d5: d[4], d6: d[5] }))
      } else {
        console.log(code)
      }
      break
    }
    case 'customer-session':
      console.log(JSON.stringify(await ensureCustomerSession(phone), null, 2))
      break
    case 'driver-online':
      console.log(JSON.stringify(await driverOnline(), null, 2))
      break
    case 'approve-payment':
      console.log(JSON.stringify(await approveLatestPayment({ tripId, phone }), null, 2))
      break
    case 'driver-accept':
      console.log(JSON.stringify(await driverAccept(), null, 2))
      break
    case 'driver-arrive':
      console.log(JSON.stringify(await driverArrive({ tripId }), null, 2))
      break
    case 'driver-start':
      console.log(JSON.stringify(await driverStart({ tripId, otp: flags.otp, phone }), null, 2))
      break
    case 'driver-complete':
      console.log(JSON.stringify(await driverComplete({ tripId }), null, 2))
      break
    case 'autopilot':
      await runAutopilot(sub || 'full-trip', phone)
      break
    default:
      console.error(`Unknown command: ${cmd}`)
      printHelp()
      process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[driver-sim] ${err.message}`)
    process.exitCode = 1
  })
}

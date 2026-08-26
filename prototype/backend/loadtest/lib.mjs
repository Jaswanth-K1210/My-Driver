import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

export const BASE = process.env.API_URL ?? 'http://localhost:4000'
export const LOG = process.env.BACKEND_LOG ?? '/tmp/mydriver-backend.log'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Reads the most recent 6-digit code the console SMS adapter printed. */
export function latestOtp(phone) {
  const log = readFileSync(LOG, 'utf8')
  const re = new RegExp(`\\[sms:console\\] -> \\${phone}: (\\d{6})`, 'g')
  let m
  let last = null
  while ((m = re.exec(log)) !== null) last = m[1]
  return last
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const payload = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${payload?.error?.code ?? text}`)
  }
  return payload
}

const TOKEN_CACHE = '/tmp/mydriver-loadtest-tokens.json'

/**
 * OTP requests are rate limited to 10 per IP per hour — correct for production,
 * fatal for a load harness that reruns. Tokens are cached between runs so
 * repeated tests do not burn the quota.
 */
export async function cachedTokens(count, role, prefix) {
  const cache = existsSync(TOKEN_CACHE) ? JSON.parse(readFileSync(TOKEN_CACHE, 'utf8')) : {}
  const key = `${role}:${prefix}:${count}`

  if (cache[key]) {
    // Verify one still works before trusting the whole set.
    try {
      await api('/v1/me', { token: cache[key][0] })
      return cache[key]
    } catch {
      delete cache[key]
    }
  }

  if (isLocal()) clearOtpQuota()

  const tokens = []
  for (let i = 0; i < count; i++) {
    tokens.push(await login(`${prefix}${String(i).padStart(3, '0')}`, role))
  }

  cache[key] = tokens
  writeFileSync(TOKEN_CACHE, JSON.stringify(cache))
  return tokens
}

export const isLocal = () => BASE.includes('localhost') || BASE.includes('127.0.0.1')

/** Local only: drops the OTP rate-limit counters so a rerun can authenticate. */
export function clearOtpQuota() {
  try {
    execSync(
      `docker compose exec -T redis sh -c "redis-cli --scan --pattern 'quota:otp:*' | xargs -r redis-cli del"`,
      { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' },
    )
  } catch {
    // Best effort — the run will simply fail on the rate limit if this did not work.
  }
}

export async function login(phone, role) {
  await api('/v1/auth/otp/request', { method: 'POST', body: { phone_number: phone, role } })
  await sleep(120)
  const otp = latestOtp(phone)
  if (!otp) throw new Error(`no OTP in ${LOG} for ${phone}`)
  const res = await api('/v1/auth/otp/verify', {
    method: 'POST',
    body: { phone_number: phone, otp, role },
  })
  return res.access_token
}

let backendPid = null

/**
 * Resident memory of the backend process, in MB.
 *
 * The PID is resolved once and cached: `lsof -iTCP:4000` enumerates every
 * connected socket, so at 15k connections re-running it per sample is slow
 * enough to fail outright.
 */
export function backendRssMb() {
  try {
    if (!backendPid) {
      backendPid = execSync("lsof -nP -iTCP:4000 -sTCP:LISTEN -t 2>/dev/null | head -1")
        .toString()
        .trim()
    }
    if (!backendPid) return null
    const rssKb = Number(execSync(`ps -o rss= -p ${backendPid}`).toString().trim())
    return Number.isFinite(rssKb) ? Math.round(rssKb / 1024) : null
  } catch {
    return null
  }
}

export async function metrics() {
  const res = await fetch(`${BASE}/metrics`)
  const text = await res.text()
  const out = {}
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue
    const [name, value] = line.split(' ')
    out[name] = Number(value)
  }
  return out
}

export function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

export function summarise(label, samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    label,
    n: sorted.length,
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    max: Math.round(sorted.at(-1) ?? 0),
  }
}

export const table = (rows) => {
  for (const r of rows) console.log('  ' + r)
}

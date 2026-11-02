// Privacy filter for everything sent to Sentry (docs/testing-plan.md §9).
// A copy lives in prototype/website/src/lib/sentry-scrub.js: keep the two in step.

const R = '[redacted]'

// Keys whose value is always personal or secret, matched word by word
// ("pickup_lat", "phoneNumber", "x-razorpay-signature").
const SECRET_WORDS = new Set([
  'otp', 'pan', 'aadhaar', 'aadhar', 'phone', 'mobile', 'msisdn',
  'lat', 'lng', 'lon', 'latitude', 'longitude', 'coords', 'coordinates', 'telemetry',
  'password', 'token', 'secret', 'cookie', 'cookies', 'authorization', 'signature', 'ticket',
])

const isSecretKey = (key: string): boolean =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => SECRET_WORDS.has(w))

// Order matters: 12-digit Aadhaar before 10-digit phone numbers.
const PATTERNS: [RegExp, string][] = [
  [/\?[^\s"'#]+/g, `?${R}`], // query strings: tickets, OTPs, lat/lng, search text
  [/\bBearer\s+\S+/gi, `Bearer ${R}`],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, R], // JWTs
  [/\b[A-Z]{5}\d{4}[A-Z]\b/gi, R], // PAN
  [/\b(otp|code)\b\W{0,3}\d{4,8}\b/gi, `$1 ${R}`],
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, R], // Aadhaar
  [/(?:\+?\b91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, R], // Indian mobile numbers
  [/-?\b\d{1,3}\.\d{4,}\b/g, R], // coordinates (4+ decimals is ~10 m)
]

export const scrubString = (s: string): string =>
  PATTERNS.reduce((out, [re, to]) => out.replace(re, to), s)

function scrub(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return scrubString(value)
  if (value === null || typeof value !== 'object' || depth > 12) return value
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k] = isSecretKey(k) ? R : scrub(v, depth + 1)
  return out
}

/** Use as beforeSend and beforeSendSpan. Request bodies (telemetry, KYC, OTPs) are never sent. */
export function scrubSentry<T extends object>(event: T): T {
  const e = event as { request?: { data?: unknown; cookies?: unknown } }
  if (e.request) {
    delete e.request.data
    delete e.request.cookies
  }
  return scrub(event, 0) as T
}

/** Local digits -> E.164. The API only accepts E.164. */
export function toE164(input, countryCode = '+91') {
  const raw = String(input ?? '').trim()
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return ''
  if (raw.startsWith('+')) return `+${digits}`
  return `${countryCode}${digits.slice(-10)}`
}

export const isValidLocal = (input) => String(input ?? '').replace(/\D/g, '').length >= 10

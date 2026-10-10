export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function formatINR(amount) {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

/** +919000000001 -> +91 90000 00001, the way Indian numbers are written. */
export function formatPhone(phone) {
  if (!phone) return ''
  const m = String(phone).match(/^\+91(\d{5})(\d{5})$/)
  return m ? `+91 ${m[1]} ${m[2]}` : phone
}

export function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 4) return phone
  return `+91 ${digits.slice(0, 2)}•••• ••${digits.slice(-2)}`
}

export function initialsOf(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

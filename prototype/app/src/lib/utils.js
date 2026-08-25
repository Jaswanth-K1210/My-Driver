export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function formatINR(amount) {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

export function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 4) return phone
  return `+91 ${digits.slice(0, 2)}•••• ••${digits.slice(-2)}`
}

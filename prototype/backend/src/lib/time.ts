const IST_OFFSET_MINUTES = 5 * 60 + 30
const NIGHT_START_HOUR = 22
const NIGHT_END_HOUR = 5

/** Hour of day in IST, 0-23, regardless of server timezone. */
function istHour(at: Date): number {
  return new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000).getUTCHours()
}

/** True when pickup falls in [22:00, 05:00) IST — the night fee window. */
export function isNightPickupIST(at: Date): boolean {
  const hour = istHour(at)
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR
}

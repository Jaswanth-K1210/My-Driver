import { NIGHT_FEE, PLATFORM_FEE } from '../trips/fare.js'
import { listRateCards } from '../trips/rate-cards.js'

/**
 * Trip options the apps render instead of hardcoding. Bump CONFIG_VERSION on
 * any change so clients can cache the payload and refetch only when it moves.
 * Car makes, models and fuel types stay in the apps on purpose.
 */
export const CONFIG_VERSION = '2026-10-10'

const REQUIREMENTS = [
  { id: 'within_city', label: 'Within city', tagline: 'Point-to-point and errands', badge: 'Local', description: 'Hourly or multi-stop trips across the city.', min_hours: 1, max_stops: 3, duration_rule: 'drive_time_plus_buffer' },
  { id: 'inter_city', label: 'Outstation', tagline: 'Outstation trips and tours', badge: 'Highway', description: 'Highway-certified drivers for one-way or round-trip outstation travel.', min_hours: null, max_stops: 3, duration_rule: 'drive_time_plus_buffer' },
  { id: 'airport', label: 'Airport', tagline: 'Drops and pickups', badge: 'Airport', description: 'Airport drops and pickups, with your flight details shared with the driver.', min_hours: 3, max_stops: 0, duration_rule: 'fixed' },
  { id: 'full_time', label: 'Full-time', tagline: 'Dedicated private driver', badge: 'Contract', description: 'A dedicated driver for 12 hours a day, by the day, week or month.', min_hours: 12, max_stops: 0, duration_rule: 'fixed' },
] as const

const PICKUP_TIMES = [
  { id: 'now', label: 'Now', offset_minutes: 0 },
  { id: 'in_30', label: 'In 30 min', offset_minutes: 30 },
  { id: 'in_60', label: 'In 1 hour', offset_minutes: 60 },
  { id: 'schedule', label: 'Schedule later', offset_minutes: null },
] as const

/**
 * VisionCam has no backend: no recording, upload or storage exists. The modes
 * are listed so an app can render the option, but every one is unavailable
 * and booking ignores vision_mode. Flip `available` only once it is built.
 */
const VISION_MODES = [
  { id: 'R', name: 'Road', description: 'Road and traffic recording', available: false },
  { id: 'D', name: 'Driver', description: 'Driver-facing cabin camera', available: false },
  { id: 'F', name: 'Full cabin', description: 'Complete interior coverage', available: false },
] as const

export async function getTripConfig() {
  // Included kilometres follow the rate card rather than a second copy of
  // the rule, so a pricing change cannot drift between server and app.
  const cards = await listRateCards()
  const kmPerHour = cards[0]?.included_km_per_hour ?? 10
  return {
    version: CONFIG_VERSION,
    currency: 'INR',
    requirements: REQUIREMENTS,
    hour_packages: [1, 2, 4, 8, 12].map((hours) => ({
      id: `h${hours}`,
      hours,
      included_km: hours * kmPerHour,
      label: hours === 1 ? '1 hour' : `${hours} hours`,
    })),
    pickup_times: PICKUP_TIMES,
    vision_modes: VISION_MODES,
    // drive_time_plus_buffer: minimum = estimated drive time + this buffer,
    // rounded up to whole hours and never below min_hours.
    duration_buffer_minutes: 10,
    fees: { platform_fee: PLATFORM_FEE, night_fee: NIGHT_FEE, night_window_ist: { start: '22:00', end: '05:00' } },
    rate_cards: cards,
  }
}

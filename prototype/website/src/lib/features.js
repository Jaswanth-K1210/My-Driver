/**
 * Phase toggles for the customer website.
 *
 * Features planned for a later phase stay in the code and data; switching one
 * off only hides it everywhere it appears. To bring one back, set it to true
 * here, or turn it on for a single build without a code change:
 *
 *   VITE_FEATURES=busBooking,scheduledPickup npm run build
 *
 * Keep a feature off until the backend actually delivers it: a visible option
 * that silently does something else is worse than no option.
 */
const DEFAULTS = {
  /** Bus / minibus bookings. Phase 2: no bus drivers, tiers or pricing yet. */
  busBooking: false,
  /** Caravan / motorhome bookings. Phase 2: no caravan drivers or pricing yet. */
  caravanBooking: false,
  /**
   * Booking for later ("In 30 min", "Tomorrow", a custom date). Phase 2: the
   * API dispatches every booking immediately; the chosen time is not sent.
   */
  scheduledPickup: false,
  /**
   * Full-time driver contracts (days, weeks, months). Phase 2: the API books
   * a single 12-hour hire, not a contract.
   */
  fullTimeContracts: false,
}

const fromEnv = String(import.meta.env?.VITE_FEATURES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const FEATURES = Object.freeze({
  ...DEFAULTS,
  ...Object.fromEntries(fromEnv.filter((k) => k in DEFAULTS).map((k) => [k, true])),
})

export const isEnabled = (flag) => FEATURES[flag] === true

/** Which flag gates which vehicle type / trip requirement. Unlisted = always on. */
const VEHICLE_FLAG = { bus: 'busBooking', caravan: 'caravanBooking' }
const REQUIREMENT_FLAG = { full_time: 'fullTimeContracts' }

export const vehicleEnabled = (id) => !VEHICLE_FLAG[id] || isEnabled(VEHICLE_FLAG[id])
export const requirementEnabled = (id) => !REQUIREMENT_FLAG[id] || isEnabled(REQUIREMENT_FLAG[id])

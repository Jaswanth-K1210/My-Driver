/**
 * Phase toggles for the customer app, mirroring the website's lib/features.js.
 *
 * Features planned for a later phase stay in the code and data; switching one
 * off only hides it. To bring one back, set it to true here, or turn it on for
 * a single run without a code change:
 *
 *   EXPO_PUBLIC_FEATURES=fullTimeContracts npm start
 *
 * Keep a feature off until the backend actually delivers it: a visible option
 * that silently does something else is worse than no option.
 */
const DEFAULTS = {
  /**
   * Full-time driver contracts (days, weeks, months). Phase 2: the API books
   * a single 12-hour hire, not a contract.
   */
  fullTimeContracts: false,
}

const fromEnv = String(process.env.EXPO_PUBLIC_FEATURES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const FEATURES = Object.freeze({
  ...DEFAULTS,
  ...Object.fromEntries(fromEnv.filter((k) => k in DEFAULTS).map((k) => [k, true])),
})

export const isEnabled = (flag) => FEATURES[flag] === true

/** Which flag gates which trip requirement. Unlisted = always on. */
const REQUIREMENT_FLAG = { full_time: 'fullTimeContracts' }

export const requirementEnabled = (id) => !REQUIREMENT_FLAG[id] || isEnabled(REQUIREMENT_FLAG[id])

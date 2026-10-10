import { showDemoData } from '../config/env.js'

let override: boolean | undefined

/** Whether console queries include demo accounts (ADMIN_DEMO_DATA). */
export const demoVisible = (): boolean => override ?? showDemoData()

/** Test-only: force demo visibility on or off; undefined restores the env. */
export function setDemoVisibility(visible: boolean | undefined): void {
  override = visible
}

/**
 * SQL fragment that drops demo accounts from a console query when the demo
 * toggle is off. `col` is the boolean column to test, e.g. 'u.is_demo'.
 * Returns '' when demo data is visible, so it can always be appended:
 *
 *   `... WHERE dp.onboarding_status = $1 ${hideDemo('u.is_demo')}`
 */
export const hideDemo = (col: string): string => (demoVisible() ? '' : `AND ${col} = false`)

/** For trips: hidden when the customer is a demo account. */
export const hideDemoTrips = (tripAlias: string): string =>
  demoVisible() ? '' : `AND NOT EXISTS (SELECT 1 FROM users demo_u WHERE demo_u.id = ${tripAlias}.customer_id AND demo_u.is_demo)`

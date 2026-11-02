/**
 * A trip that earned its driver money: completed, or cancelled by the
 * customer after the driver arrived, with the fee charged. Earnings and
 * payouts must all use these, or a fee is charged that no driver is paid.
 * `t` is the table alias with its dot ('t.'), or '' for none.
 */
export const earningTrip = (t = ''): string => `(${t}status = 'COMPLETED' OR ${t}cancellation_fee > 0)`

/** When it earned: completion, or the cancellation that charged the fee. */
export const earnedAt = (t = ''): string => `COALESCE(${t}completed_at, ${t}cancelled_at)`

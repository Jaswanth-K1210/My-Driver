-- Three small additions the apps were waiting on.

-- Amount due: when the final fare is above the hold, the difference is
-- collected with a second order (normal capture, not a hold). The original
-- payment row carries it so a trip still has exactly one payment of record.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS due_order_id     TEXT UNIQUE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS due_payment_id   TEXT UNIQUE;
-- What the second order collected. amount_due drops to 0 once it is paid.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_due_paid  DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Driver arrived: set once, when the driver's position first comes within
-- reach of the pickup while the trip waits for the handshake.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

-- Practical tests happen on a date Ops sets. A scheduled attempt has a
-- scheduled_at and no submitted_at until it is graded.
ALTER TABLE assessment_attempts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

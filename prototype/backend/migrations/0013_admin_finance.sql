-- Admin Portal, part 3: driver payout reconciliation.
--
-- trips already carries fare_amount, platform_fee, night_fee and
-- driver_earnings, so a payout is a grouping over rows that already exist.
-- No new money fields.

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('PENDING', 'APPROVED', 'PAID', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS driver_payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID NOT NULL REFERENCES users(id),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  trip_count   INT NOT NULL,
  gross        DECIMAL(12,2) NOT NULL,
  platform_fee DECIMAL(12,2) NOT NULL,
  net          DECIMAL(12,2) NOT NULL,
  status       payout_status NOT NULL DEFAULT 'PENDING',
  reference    TEXT,
  approved_by  UUID REFERENCES users(id),
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payout_period CHECK (period_end >= period_start),
  CONSTRAINT payout_net    CHECK (net = gross - platform_fee)
);

CREATE INDEX IF NOT EXISTS idx_payouts_queue
  ON driver_payouts(status, created_at DESC);

-- THIS is the double-payment guard. A UNIQUE(driver_id, period) would not be:
-- two overlapping periods would each legitimately claim the same trip.
-- Stamping the trip row makes "paid" a property of the trip rather than an
-- inference from dates, and makes generation idempotent under concurrency
-- (a second run matches WHERE payout_id IS NULL and claims zero rows).
ALTER TABLE trips ADD COLUMN IF NOT EXISTS payout_id UUID REFERENCES driver_payouts(id);

CREATE INDEX IF NOT EXISTS idx_trips_unpaid
  ON trips(driver_id, completed_at)
  WHERE payout_id IS NULL AND status = 'COMPLETED';

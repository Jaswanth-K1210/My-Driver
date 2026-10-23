-- Fees the operations console can change. Until now these lived in code
-- (fare.ts), so a fee change needed a deploy. One row, read on every quote.
CREATE TABLE IF NOT EXISTS pricing_fees (
  id                 BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  platform_fee       NUMERIC(10,2) NOT NULL DEFAULT 19  CHECK (platform_fee >= 0),
  night_fee          NUMERIC(10,2) NOT NULL DEFAULT 30  CHECK (night_fee >= 0),
  city_stop_fee      NUMERIC(10,2) NOT NULL DEFAULT 60  CHECK (city_stop_fee >= 0),
  intercity_stop_fee NUMERIC(10,2) NOT NULL DEFAULT 100 CHECK (intercity_stop_fee >= 0),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO pricing_fees DEFAULT VALUES ON CONFLICT (id) DO NOTHING;

-- A customer's safety defaults. NULL safety_set_at means never set: the
-- booking form asks once, then pre-fills every later ride.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS safety_speed_limit_kmh      INT CHECK (safety_speed_limit_kmh BETWEEN 20 AND 120),
  ADD COLUMN IF NOT EXISTS safety_share_with_guardians BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS safety_prefer_female_driver BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS safety_set_at               TIMESTAMPTZ;

-- Recorded by ops at onboarding review. Only used to honour a customer's
-- preference for a female driver; never shown to customers.
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('FEMALE', 'MALE', 'OTHER'));

-- What this booking asked for, kept on the trip so dispatch and the trip
-- start can act on it even if the customer changes their defaults later.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS prefer_female_driver BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_with_guardians BOOLEAN NOT NULL DEFAULT false;

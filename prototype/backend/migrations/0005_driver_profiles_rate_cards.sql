DO $$ BEGIN
  CREATE TYPE driver_availability AS ENUM ('OFFLINE', 'ONLINE', 'ON_TRIP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS driver_profiles (
  user_id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  certifications         TEXT[] NOT NULL DEFAULT ARRAY['MD-Standard'],
  night_shield_certified BOOLEAN NOT NULL DEFAULT false,
  mydriver_score         DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  rating                 DECIMAL(3,2),
  rating_count           INT NOT NULL DEFAULT 0,
  total_trips            INT NOT NULL DEFAULT 0,
  vehicle_model          TEXT,
  vehicle_plate          TEXT,
  availability           driver_availability NOT NULL DEFAULT 'OFFLINE',
  face_reference_key     TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_available
  ON driver_profiles(availability) WHERE availability = 'ONLINE';
CREATE INDEX IF NOT EXISTS idx_driver_certifications
  ON driver_profiles USING GIN (certifications);

CREATE TABLE IF NOT EXISTS rate_cards (
  skill_id             TEXT PRIMARY KEY,
  label                TEXT NOT NULL,
  per_km_rate          DECIMAL(6,2) NOT NULL,
  hourly_rate          DECIMAL(6,2) NOT NULL,
  included_km_per_hour SMALLINT NOT NULL DEFAULT 10,
  active               BOOLEAN NOT NULL DEFAULT true
);

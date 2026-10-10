-- The customer's Garage: their own cars, which a MyDriver driver will drive.
-- Make, model and the fuel/transmission enums mirror the app's hardcoded
-- taxonomy (CAR_BRANDS, ENGINE_TYPES); the server stores text and checks the
-- two enums so a typo cannot reach dispatch.

CREATE TABLE IF NOT EXISTS saved_vehicles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname     TEXT,
  company      TEXT NOT NULL,
  model        TEXT NOT NULL,
  engine_type  TEXT NOT NULL CHECK (engine_type IN ('Petrol', 'Diesel', 'Electric (EV)', 'Hybrid', 'CNG')),
  transmission TEXT NOT NULL CHECK (transmission IN ('Manual', 'Automatic')),
  -- Stored normalised (upper case, no spaces) so 'TS09 EA 4120' and
  -- 'ts09ea4120' are the same car.
  plate        TEXT,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_vehicles_user ON saved_vehicles(user_id, created_at);

-- One default car per person, enforced by the database rather than by hoping
-- every code path clears the old default first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_vehicles_default
  ON saved_vehicles(user_id) WHERE is_default;

-- The same plate twice in one garage is a duplicate entry, not a second car.
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_vehicles_plate
  ON saved_vehicles(user_id, plate) WHERE plate IS NOT NULL;

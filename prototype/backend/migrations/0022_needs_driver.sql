-- When the first dispatch rounds find nobody, the trip is not ended at once:
-- it stays REQUESTED, the console flags it, and dispatch keeps retrying until
-- EXTENDED_SEARCH_MINUTES after booking. Set when that extended search began.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS needs_driver_since TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS trips_needs_driver_idx
  ON trips (needs_driver_since) WHERE needs_driver_since IS NOT NULL AND status IN ('REQUESTED', 'MATCHED');

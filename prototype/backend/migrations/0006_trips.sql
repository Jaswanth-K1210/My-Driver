DO $$ BEGIN
  CREATE TYPE trip_status AS ENUM (
    'REQUESTED', 'MATCHED', 'HANDSHAKE_PENDING', 'IN_TRIP',
    'COMPLETED', 'CANCELLED', 'NO_DRIVERS_FOUND', 'ESCALATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_type AS ENUM ('POINT_TO_POINT', 'HOURLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE offer_status AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS trips (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               UUID NOT NULL REFERENCES users(id),
  driver_id                 UUID REFERENCES users(id),
  status                    trip_status NOT NULL DEFAULT 'REQUESTED',
  booking_type              booking_type NOT NULL,
  hourly_package_hours      SMALLINT,
  pickup_lat                DOUBLE PRECISION NOT NULL,
  pickup_lng                DOUBLE PRECISION NOT NULL,
  pickup_address            TEXT,
  drop_lat                  DOUBLE PRECISION,
  drop_lng                  DOUBLE PRECISION,
  drop_address              TEXT,
  required_certification    TEXT NOT NULL REFERENCES rate_cards(skill_id),
  speed_ceiling_kmh         INT NOT NULL,
  pickup_handshake_otp_hash TEXT NOT NULL,
  handshake_attempts        SMALLINT NOT NULL DEFAULT 0,
  dispatch_round            SMALLINT NOT NULL DEFAULT 0,
  estimated_distance_km     DECIMAL(7,2),
  estimated_fare            DECIMAL(10,2),
  distance_km               DECIMAL(7,2),
  duration_min              INT,
  fare_amount               DECIMAL(10,2),
  platform_fee              DECIMAL(10,2),
  night_fee                 DECIMAL(10,2),
  driver_earnings           DECIMAL(10,2),
  cancellation_reason       TEXT,
  cancelled_by              UUID REFERENCES users(id),
  idempotency_key           TEXT,
  requested_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_at                TIMESTAMPTZ,
  handshake_at              TIMESTAMPTZ,
  started_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  CONSTRAINT trips_hourly_hours CHECK (
    (booking_type = 'HOURLY' AND hourly_package_hours IS NOT NULL)
    OR (booking_type = 'POINT_TO_POINT' AND drop_lat IS NOT NULL AND drop_lng IS NOT NULL)
  )
);

-- Keyset pagination support (no OFFSET anywhere).
CREATE INDEX IF NOT EXISTS idx_trips_customer_keyset
  ON trips(customer_id, requested_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_trips_driver_keyset
  ON trips(driver_id, requested_at DESC, id DESC);

-- Active trips are a tiny fraction of the table; a partial index keeps the
-- dispatch sweeper off a full scan at a billion historical rows.
CREATE INDEX IF NOT EXISTS idx_trips_active
  ON trips(status, requested_at)
  WHERE status IN ('REQUESTED', 'MATCHED', 'HANDSHAKE_PENDING', 'IN_TRIP');

CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_idempotency
  ON trips(customer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS trip_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  actor_id   UUID REFERENCES users(id),
  actor_role user_role,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_events_trip ON trip_events(trip_id, created_at);

-- trip_events is the immutable lifecycle ledger. Enforced in the database so
-- no future code path can quietly rewrite history.
CREATE OR REPLACE FUNCTION trip_events_append_only() RETURNS TRIGGER AS $fn$
BEGIN
  RAISE EXCEPTION 'trip_events is append-only';
END; $fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_events_append_only ON trip_events;
CREATE TRIGGER trg_trip_events_append_only
  BEFORE UPDATE OR DELETE ON trip_events
  FOR EACH ROW EXECUTE FUNCTION trip_events_append_only();

CREATE TABLE IF NOT EXISTS trip_offers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_id    UUID NOT NULL REFERENCES users(id),
  round        SMALLINT NOT NULL,
  status       offer_status NOT NULL DEFAULT 'PENDING',
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_offers_pending
  ON trip_offers(expires_at) WHERE status = 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_one_live_per_trip
  ON trip_offers(trip_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS driver_ratings (
  trip_id    UUID PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  driver_id  UUID NOT NULL REFERENCES users(id),
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ratings_driver ON driver_ratings(driver_id);

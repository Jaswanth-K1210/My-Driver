CREATE EXTENSION IF NOT EXISTS timescaledb;

DO $$ BEGIN
  CREATE TYPE telemetry_source AS ENUM ('DRIVER', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS telematics_logs (
  time      TIMESTAMPTZ NOT NULL,
  trip_id   UUID NOT NULL,
  source    telemetry_source NOT NULL,
  lat       DOUBLE PRECISION NOT NULL,
  lng       DOUBLE PRECISION NOT NULL,
  speed_kmh REAL,
  heading   REAL,
  accel_z   REAL,
  gyro_z    REAL
);

-- No foreign key to trips: at ~11.5 billion rows/day the referential check cost
-- is prohibitive, and orphan telemetry is harmless. Integrity is enforced at
-- the gateway, which only accepts frames for a trip the sender participates in.
SELECT create_hypertable(
  'telematics_logs', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_telematics_trip ON telematics_logs(trip_id, time DESC);

-- Compression and retention are mandatory at this volume, not optional.
ALTER TABLE telematics_logs SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'trip_id',
  timescaledb.compress_orderby   = 'time DESC'
);

SELECT add_compression_policy('telematics_logs', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('telematics_logs', INTERVAL '90 days', if_not_exists => TRUE);

-- Phase 3: the Trip Vault. 8-point inspection capture, watermarked and
-- content-hashed photos, and signed trip certificates.

DO $$ BEGIN
  CREATE TYPE inspection_phase AS ENUM ('PRE', 'POST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inspection_zone AS ENUM (
    'FRONT', 'REAR', 'LEFT', 'RIGHT', 'DASHBOARD', 'SEATS', 'FUEL_ODOMETER', 'BOOT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inspections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  phase        inspection_phase NOT NULL,
  driver_id    UUID NOT NULL REFERENCES users(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- One pre-trip and one post-trip inspection per ride, never more.
  CONSTRAINT inspections_one_per_phase UNIQUE (trip_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_inspections_trip ON inspections(trip_id);

CREATE TABLE IF NOT EXISTS inspection_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  zone          inspection_zone NOT NULL,
  storage_key   TEXT NOT NULL,
  -- SHA-256 of the stored, watermarked bytes. This is what makes the archive
  -- tamper-evident: any later edit changes the digest.
  sha256        TEXT NOT NULL,
  bytes         INT NOT NULL,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  captured_at   TIMESTAMPTZ NOT NULL,
  watermark     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A zone is captured once per inspection; a retake replaces nothing.
  CONSTRAINT inspection_photos_one_per_zone UNIQUE (inspection_id, zone)
);

CREATE INDEX IF NOT EXISTS idx_inspection_photos ON inspection_photos(inspection_id);

-- Inspection photos are evidence. Like trip_events, they are append-only.
CREATE OR REPLACE FUNCTION inspection_photos_append_only() RETURNS TRIGGER AS $fn$
BEGIN
  RAISE EXCEPTION 'inspection_photos is append-only';
END; $fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inspection_photos_append_only ON inspection_photos;
CREATE TRIGGER trg_inspection_photos_append_only
  BEFORE UPDATE OR DELETE ON inspection_photos
  FOR EACH ROW EXECUTE FUNCTION inspection_photos_append_only();

CREATE TABLE IF NOT EXISTS trip_certificates (
  trip_id     UUID PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  -- Human-facing reference printed on the document, e.g. MV-2026-1A2B3C.
  cert_id     TEXT NOT NULL UNIQUE,
  storage_key TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  payload     JSONB NOT NULL,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION trip_certificates_append_only() RETURNS TRIGGER AS $fn$
BEGIN
  RAISE EXCEPTION 'trip_certificates is append-only';
END; $fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_certificates_append_only ON trip_certificates;
CREATE TRIGGER trg_trip_certificates_append_only
  BEFORE UPDATE OR DELETE ON trip_certificates
  FOR EACH ROW EXECUTE FUNCTION trip_certificates_append_only();

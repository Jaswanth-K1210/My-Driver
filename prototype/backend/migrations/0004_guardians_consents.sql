CREATE TABLE IF NOT EXISTS guardian_contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  relation   TEXT,
  phone      VARCHAR(16) NOT NULL,
  position   SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The maximum of three guardians is a database rule, not merely an app rule.
  CONSTRAINT guardian_position_range CHECK (position BETWEEN 1 AND 3),
  CONSTRAINT guardian_unique_position UNIQUE (user_id, position)
);

DO $$ BEGIN
  CREATE TYPE consent_purpose AS ENUM (
    'LOCATION_TRACKING', 'TELEMATICS_COLLECTION', 'GUARDIAN_SHARING', 'BIOMETRIC_LIVENESS'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS consents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    consent_purpose NOT NULL,
  version    TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id, purpose);

-- Admin Portal, part 1: driver testing, badges, KYC documents, approval gate.
--
-- Everything here answers one question: "is this person allowed to drive?"
-- The answer must be derivable from the database alone, not from an admin's
-- memory of having clicked approve.

/* ── Assessments: the tests a driver sits before registration ──────────── */

DO $$ BEGIN
  CREATE TYPE assessment_kind AS ENUM
    ('WRITTEN', 'PRACTICAL', 'LIVENESS', 'REACTION', 'DOCUMENT_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS assessments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Versioned on purpose: editing a live test invalidates every past score,
  -- so a changed test is a new test ('MD-ROAD-RULES-V2'), never an edit.
  code           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  kind           assessment_kind NOT NULL,
  passing_score  SMALLINT NOT NULL CHECK (passing_score BETWEEN 0 AND 100),
  max_attempts   SMALLINT NOT NULL DEFAULT 3,
  cooldown_hours SMALLINT NOT NULL DEFAULT 24,
  validity_days  SMALLINT,
  -- JSONB rather than a questions table: this document is read whole to render
  -- the test and never joined or queried field-by-field. A table would add a
  -- join to every render and buy nothing.
  questions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessments_active
  ON assessments(kind) WHERE active;

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES assessments(id),
  attempt_no    SMALLINT NOT NULL,
  score         SMALLINT CHECK (score BETWEEN 0 AND 100),
  passed        BOOLEAN,
  answers       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- NULL means the attempt was auto-scored rather than graded by a person.
  evaluated_by  UUID REFERENCES users(id),
  notes         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,
  CONSTRAINT attempt_unique UNIQUE (driver_id, assessment_id, attempt_no)
);

-- Failed attempts are kept, never deleted: max_attempts and cooldown_hours can
-- only be enforced against a complete history.
CREATE INDEX IF NOT EXISTS idx_attempts_driver
  ON assessment_attempts(driver_id, submitted_at DESC);

-- The ops grading queue: submitted, but nobody has scored it yet.
CREATE INDEX IF NOT EXISTS idx_attempts_grading
  ON assessment_attempts(assessment_id)
  WHERE submitted_at IS NOT NULL AND passed IS NULL;

/* ── Badges: what passing a test earns, and what that badge authorises ─── */

CREATE TABLE IF NOT EXISTS badges (
  code          TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  -- The bridge that makes a badge an authorisation rather than a decoration:
  -- earning it is what puts the skill into driver_profiles.certifications,
  -- which is what lets dispatch offer the driver that class of trip.
  grants_skill  TEXT REFERENCES rate_cards(skill_id),
  requires      TEXT[] NOT NULL DEFAULT '{}',
  validity_days SMALLINT,
  active        BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS driver_badges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code        TEXT NOT NULL REFERENCES badges(code),
  awarded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  awarded_by        UUID REFERENCES users(id),
  source_attempt_id UUID REFERENCES assessment_attempts(id),
  expires_at        TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  revoke_reason     TEXT
);

-- A driver holds each badge at most once *live*. Revoked awards stay as
-- history, so "lost MD-Night in March, re-qualified in June" is answerable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_badge_live
  ON driver_badges(driver_id, badge_code) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_badges_expiring
  ON driver_badges(expires_at)
  WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

/* ── KYC documents ─────────────────────────────────────────────────────── */

DO $$ BEGIN
  CREATE TYPE document_kind AS ENUM
    ('DRIVING_LICENCE', 'AADHAAR', 'POLICE_VERIFICATION', 'PHOTO', 'ADDRESS_PROOF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_status AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS driver_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          document_kind NOT NULL,
  -- S3, same bucket as inspection_photos. Bytes never enter the database.
  storage_key   TEXT NOT NULL,
  -- Last four digits only. Storing a full Aadhaar or licence number creates
  -- breach liability with no operational benefit: the reviewer verifies
  -- against the image, and last-4 is enough to match a record afterwards.
  number_last4  VARCHAR(4),
  expires_on    DATE,
  status        document_status NOT NULL DEFAULT 'SUBMITTED',
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  reject_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deliberately NOT unique on (driver_id, kind): a rejected licence gets
-- resubmitted, and the rejection history is what an audit wants.
CREATE INDEX IF NOT EXISTS idx_documents_driver
  ON driver_documents(driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_queue
  ON driver_documents(status) WHERE status = 'SUBMITTED';

-- Drives the nightly expiry job. A licence expiry date nothing checks is not
-- a control.
CREATE INDEX IF NOT EXISTS idx_documents_expiry
  ON driver_documents(expires_on) WHERE status = 'VERIFIED';

/* ── The approval gate on driver_profiles ──────────────────────────────── */

DO $$ BEGIN
  CREATE TYPE onboarding_status AS ENUM
    ('PENDING', 'TESTING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Added as APPROVED so the backfill does not instantly suspend every existing
-- driver, then the default flips to PENDING so new signups must be reviewed.
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS onboarding_status onboarding_status NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS reviewed_by  UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note  TEXT,
  -- The tenure clock Night Shield's "6+ months" rule reads (0012).
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

ALTER TABLE driver_profiles ALTER COLUMN onboarding_status SET DEFAULT 'PENDING';

UPDATE driver_profiles SET onboarded_at = updated_at WHERE onboarded_at IS NULL;

-- Partial: the review queue only ever asks for drivers who are not approved,
-- which is a small minority. A full index would be mostly dead weight.
CREATE INDEX IF NOT EXISTS idx_driver_onboarding
  ON driver_profiles(onboarding_status) WHERE onboarding_status <> 'APPROVED';

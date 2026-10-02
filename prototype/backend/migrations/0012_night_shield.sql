-- Admin Portal, part 2: Night Shield operations.
--
-- Night Shield is a hard operating protocol (22:00-05:00), not a feature
-- toggle. Today driver_profiles.night_shield_certified is a bare boolean with
-- no issuer, no expiry and no revocation path. These tables give it a
-- lifecycle, and put its qualification rules into the database so no admin
-- screen and no future code path can issue it to an unqualified driver.

/* ── Qualification, re-verified every 90 days ──────────────────────────── */

CREATE TABLE IF NOT EXISTS night_shield_quals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qualified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at           TIMESTAMPTZ NOT NULL,
  -- Snapshots, not lookups: these record what was true at issuance, which is
  -- what an incident review six months later actually needs to know.
  tenure_days_at_check INT NOT NULL,
  score_at_check       DECIMAL(5,2) NOT NULL,
  verified_by          UUID REFERENCES users(id),
  revoked_at           TIMESTAMPTZ,
  revoke_reason        TEXT,
  -- "6+ months tenure and score >= 85", written into the database. No admin
  -- screen, script or code path can issue a qualification that violates this.
  CONSTRAINT nss_tenure CHECK (tenure_days_at_check >= 180),
  CONSTRAINT nss_score  CHECK (score_at_check >= 85.00),
  CONSTRAINT nss_window CHECK (expires_at > qualified_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nss_live
  ON night_shield_quals(driver_id) WHERE revoked_at IS NULL;

-- Drives the nightly re-verification sweeper. A 90-day expiry that nothing
-- enforces is a comment, not a control.
CREATE INDEX IF NOT EXISTS idx_nss_expiring
  ON night_shield_quals(expires_at) WHERE revoked_at IS NULL;

/* ── Shift-start liveness + reaction test ──────────────────────────────── */

CREATE TABLE IF NOT EXISTS night_shift_checks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The operating NIGHT, not the calendar date: a shift starting 23:40 and one
  -- starting 01:20 belong to the same night. The service computes this as
  -- (now() - INTERVAL '5 hours')::date so 22:00-05:00 maps to one row.
  shift_date          DATE NOT NULL,
  liveness_confidence DECIMAL(4,3),
  liveness_passed     BOOLEAN NOT NULL DEFAULT false,
  reaction_ms         INT,
  reaction_passed     BOOLEAN NOT NULL DEFAULT false,
  -- Generated, not written: computed by Postgres so it cannot drift from its
  -- inputs. Setting this by hand in two services is how a driver ends up
  -- online with a failed liveness check.
  passed              BOOLEAN GENERATED ALWAYS AS
                        (liveness_passed AND reaction_passed) STORED,
  selfie_key          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nsc_one_per_shift UNIQUE (driver_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_nsc_today ON night_shift_checks(shift_date, passed);

/* ── The 10-minute post-drop check-in call ─────────────────────────────── */

DO $$ BEGIN
  CREATE TYPE checkin_outcome AS ENUM
    ('PENDING', 'SAFE', 'NO_ANSWER', 'NEEDS_FOLLOWUP', 'ESCALATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS post_trip_checkins (
  -- trip_id as PK: one check-in per trip, structurally.
  trip_id       UUID PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  due_at        TIMESTAMPTZ NOT NULL,
  called_at     TIMESTAMPTZ,
  agent_id      UUID REFERENCES users(id),
  outcome       checkin_outcome NOT NULL DEFAULT 'PENDING',
  notes         TEXT,
  -- Set when a NO_ANSWER becomes a real incident.
  escalation_id UUID REFERENCES escalations(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The Safety Desk work queue: "who is due a call right now", without scanning
-- resolved check-ins. Rows are inserted only for trips completing inside the
-- 22:00-05:00 window, so day trips never enter this queue.
CREATE INDEX IF NOT EXISTS idx_checkins_due
  ON post_trip_checkins(due_at) WHERE outcome = 'PENDING';

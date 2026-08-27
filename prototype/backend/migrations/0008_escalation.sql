-- Phase 2: integrity evaluation, L0-L5 escalation, guardian links, Safety Desk.

-- Safety Desk and operations roles from admin_crm_spec.md. ALTER TYPE ADD VALUE
-- is transaction-safe on PG12+ so long as the new value is not *used* in the
-- same transaction; these migrations only reference the type, never the values.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SAFETY_DESK_AGENT';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'OPS_MANAGER';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'FINANCE';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

DO $$ BEGIN
  CREATE TYPE escalation_level AS ENUM ('L0', 'L1', 'L2', 'L3', 'L4', 'L5');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE escalation_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Every automated detection. The unique constraint is the backstop that makes
-- anomaly raising idempotent across instances; the Redis claim is the fast path.
CREATE TABLE IF NOT EXISTS anomalies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  level        escalation_level NOT NULL DEFAULT 'L1',
  window_start TIMESTAMPTZ NOT NULL,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT anomalies_unique_window UNIQUE (trip_id, reason, window_start)
);

CREATE INDEX IF NOT EXISTS idx_anomalies_trip ON anomalies(trip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS escalations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  level            escalation_level NOT NULL,
  status           escalation_status NOT NULL DEFAULT 'OPEN',
  reason           TEXT NOT NULL,
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The documented SLA: under 3 minutes from L2 to human agent contact.
  sla_deadline     TIMESTAMPTZ,
  acknowledged_at  TIMESTAMPTZ,
  acknowledged_by  UUID REFERENCES users(id),
  assigned_agent_id UUID REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES users(id),
  resolution       TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live escalation per trip: a second anomaly promotes the existing one
-- rather than opening a competing incident for the same ride.
CREATE UNIQUE INDEX IF NOT EXISTS idx_escalations_one_live_per_trip
  ON escalations(trip_id) WHERE status <> 'RESOLVED';

-- The Safety Desk queue: open incidents, worst first, oldest first.
CREATE INDEX IF NOT EXISTS idx_escalations_queue
  ON escalations(level DESC, opened_at) WHERE status <> 'RESOLVED';

CREATE INDEX IF NOT EXISTS idx_escalations_sla
  ON escalations(sla_deadline) WHERE status = 'OPEN' AND sla_deadline IS NOT NULL;

-- Append-only history of everything that happened to an incident.
CREATE TABLE IF NOT EXISTS escalation_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id UUID NOT NULL REFERENCES escalations(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  actor_id      UUID REFERENCES users(id),
  actor_role    user_role,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalation_events
  ON escalation_events(escalation_id, created_at);

CREATE OR REPLACE FUNCTION escalation_events_append_only() RETURNS TRIGGER AS $fn$
BEGIN
  RAISE EXCEPTION 'escalation_events is append-only';
END; $fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_escalation_events_append_only ON escalation_events;
CREATE TRIGGER trg_escalation_events_append_only
  BEFORE UPDATE OR DELETE ON escalation_events
  FOR EACH ROW EXECUTE FUNCTION escalation_events_append_only();

-- Guardian tracking links: shareable, expiring, revocable, scoped to one trip.
CREATE TABLE IF NOT EXISTS guardian_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  -- Hashed, like every other credential in this service.
  token_hash TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  views      INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardian_links_trip ON guardian_links(trip_id);

-- Push device registrations. Phase 1 shipped the push provider interface with
-- nowhere to send; this is that missing piece.
CREATE TABLE IF NOT EXISTS device_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL,
  token      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT device_tokens_unique UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);

-- Immutable audit ledger for Safety Desk actions. admin_crm_spec.md requires
-- every action - viewing a feed, opening a vault record - to be logged.
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID REFERENCES users(id),
  actor_role user_role,
  action     TEXT NOT NULL,
  subject    TEXT,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_log(subject, created_at DESC);

CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS TRIGGER AS $fn$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END; $fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_log;
CREATE TRIGGER trg_audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- KYC verifications (PAN, Aadhaar) and customer payments.

/* ── KYC ───────────────────────────────────────────────────────────────── */

-- PAN is checked by API, not by a reviewer looking at an image, but a scan can
-- still be uploaded, so it belongs in the document enum too. Not used in this
-- file: a new enum value cannot be referenced in the transaction that adds it.
ALTER TYPE document_kind ADD VALUE IF NOT EXISTS 'PAN';

DO $$ BEGIN
  CREATE TYPE kyc_kind AS ENUM ('PAN', 'AADHAAR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS kyc_verifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             kyc_kind NOT NULL,
  status           kyc_status NOT NULL DEFAULT 'PENDING',
  provider         TEXT NOT NULL,
  -- Aadhaar OTP: the provider's ref_id that the verify call must echo back.
  provider_ref     TEXT,
  -- Same rule as driver_documents: last four only. A full PAN or Aadhaar in
  -- this table would be breach liability with no operational use.
  number_last4     VARCHAR(4) NOT NULL,
  name_on_record   TEXT,
  name_match_score SMALLINT CHECK (name_match_score BETWEEN 0 AND 100),
  failure_reason   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at      TIMESTAMPTZ
);

-- At most one live verified record per person per kind. Failed attempts are
-- kept as history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_verified
  ON kyc_verifications(user_id, kind) WHERE status = 'VERIFIED';

CREATE INDEX IF NOT EXISTS idx_kyc_user
  ON kyc_verifications(user_id, created_at DESC);

/* ── Payments ──────────────────────────────────────────────────────────── */

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM
    ('CREATED', 'AUTHORIZED', 'CAPTURED', 'RELEASED', 'REFUNDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One payment per trip. A retry after a decline reuses the row and order.
  trip_id             UUID NOT NULL UNIQUE REFERENCES trips(id),
  customer_id         UUID NOT NULL REFERENCES users(id),
  provider            TEXT NOT NULL,
  provider_order_id   TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT UNIQUE,
  currency            CHAR(3) NOT NULL DEFAULT 'INR',
  amount_authorized   DECIMAL(10,2) NOT NULL CHECK (amount_authorized > 0),
  amount_captured     DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_refunded     DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- Final fare above the hold cannot be captured from it; what is left over
  -- is recorded here rather than silently written off.
  amount_due          DECIMAL(10,2) NOT NULL DEFAULT 0,
  status              payment_status NOT NULL DEFAULT 'CREATED',
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_capture_le_auth CHECK (amount_captured <= amount_authorized),
  CONSTRAINT payment_refund_le_capture CHECK (amount_refunded <= amount_captured)
);

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id, created_at DESC);

-- Every provider callback, deduplicated on the provider's event id. The UNIQUE
-- is what makes a webhook redelivery a no-op instead of a double refund.
CREATE TABLE IF NOT EXISTS payment_events (
  id                BIGSERIAL PRIMARY KEY,
  payment_id        UUID REFERENCES payments(id),
  provider_event_id TEXT NOT NULL UNIQUE,
  type              TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

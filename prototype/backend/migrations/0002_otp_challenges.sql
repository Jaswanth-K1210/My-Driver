CREATE TABLE IF NOT EXISTS otp_challenges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(16) NOT NULL,
  role         user_role NOT NULL,
  code_hash    TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  consumed_at  TIMESTAMPTZ,
  request_ip   INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone_created
  ON otp_challenges(phone_number, created_at DESC);

-- Supports "find the one live challenge for this phone" without a table scan.
CREATE INDEX IF NOT EXISTS idx_otp_live
  ON otp_challenges(phone_number) WHERE consumed_at IS NULL;

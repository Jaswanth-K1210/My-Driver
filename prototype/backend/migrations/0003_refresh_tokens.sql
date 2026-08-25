CREATE TABLE IF NOT EXISTS refresh_tokens (
  -- id is the sha256 of the token selector, so it doubles as the lookup index.
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        user_role NOT NULL,
  token_hash  TEXT NOT NULL,
  device_id   TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  replaced_by TEXT,
  -- Chain root: every token rotated from the same original login shares this.
  chain_id    UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_chain ON refresh_tokens(chain_id);

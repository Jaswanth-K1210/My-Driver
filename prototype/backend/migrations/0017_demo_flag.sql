-- Demo data for exercising the operations console. Demo accounts are marked,
-- never mixed in silently: trip_events and audit_log are append-only, so demo
-- rows cannot be deleted later, only hidden. ADMIN_DEMO_DATA=hide filters
-- every console list and figure on this flag; production always hides.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Only demo rows are indexed: the filter is "NOT is_demo", and real accounts
-- are the overwhelming majority, so a partial index stays tiny.
CREATE INDEX IF NOT EXISTS idx_users_demo ON users(id) WHERE is_demo;

# MyDriver Admin Portal — Design

Date: 2026-09-17
Status: Draft, awaiting approval
Supersedes nothing. Implements the un-built half of `docs/admin_crm_spec.md`.

---

## 0. The database question, answered

> "These are relational data, right? We're not using MongoDB."

Correct, and the project already reflects that. **There is no MongoDB anywhere
in this repository** — no `mongo`/`mongoose` dependency in any `package.json`,
no driver import, no connection string.

The system of record is **PostgreSQL 17** (via the TimescaleDB image, for the
telemetry hypertable):

```
prototype/backend/docker-compose.yml
  postgres:  timescale/timescaledb:2.17.2-pg17
  pgbouncer: transaction pooling, MAX_CLIENT_CONN 10000
  redis:     7.4-alpine
```

Redis is a **cache and pub/sub bus only** — WebSocket fan-out, geo index,
OTP challenges, last-known position. Nothing durable lives there alone. If
Redis is flushed the platform degrades; it does not lose data.

### Why relational is the right call here, concretely

This is not a stylistic preference. Four properties of this domain make a
document store actively worse:

1. **The data is a graph of entities, not a tree of documents.** A trip
   references a customer, a driver, a rate card, an escalation, a vault
   certificate, a payout. A driver references trips, documents, ratings,
   payouts. No aggregate root exists that owns the others — whichever entity
   you pick as the "document", four others need to point into it.

2. **Money requires transactions across tables.** Marking a payout `PAID` must
   stamp `payout_id` onto exactly the trips it covers, atomically, or you pay
   a trip twice. That is a multi-row ACID transaction with a foreign-key
   guarantee. Postgres gives it for free.

3. **Referential integrity is a safety control, not a nicety.** An escalation
   that points at a deleted trip is a Safety Desk agent looking at a blank
   screen during an L4 incident. `REFERENCES trips(id)` makes that state
   unrepresentable.

4. **The audit ledger must be provably append-only.** `audit_log` already
   enforces this with a `BEFORE UPDATE OR DELETE` trigger that raises
   (`migrations/0008_escalation.sql:133`). This is a database-level guarantee
   no application bug can bypass — and it is exactly what a regulator or a
   court asks for when Trip Vault evidence is released.

The one genuinely non-relational workload — high-volume GPS/sensor telemetry —
is already handled correctly by a **TimescaleDB hypertable**
(`migrations/0010_trips_telemetry.sql`), which is still Postgres. Adding
MongoDB would mean running a second database to serve the one workload
Postgres already handles well.

**Nothing in this plan changes the database engine.** It adds one migration.

---

## 1. What already exists (scope-shrinking finding)

`docs/admin_crm_spec.md` describes two operational groups. **The first is
already built end to end.**

### Safety Desk — BUILT, needs zero backend or DB work

`src/modules/safety-desk/routes.ts` already ships all ten endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /v1/admin/stats` | active trips, open escalations, SLA breaches, counts by level |
| `GET /v1/admin/trips/active` | the live board |
| `GET /v1/admin/escalations` | queue, auto-prioritised, with SLA countdown |
| `GET /v1/admin/escalations/:id` | one incident plus its full event timeline |
| `POST /v1/admin/escalations/:id/acknowledge` | agent claims it, stops the SLA clock |
| `POST /v1/admin/escalations/:id/promote` | raise L0→L5 |
| `POST /v1/admin/escalations/:id/resolve` | close with a resolution note |
| `POST /v1/admin/escalations/:id/call` | IVR/direct call to driver or customer |
| `POST /v1/admin/escalations/:id/notify-guardians` | emergency SMS fan-out |
| `POST /v1/admin/escalations/:id/release-evidence` | Trip Vault packet to law enforcement |

Also already present:

- **RBAC**: `SAFETY_DESK_AGENT`, `OPS_MANAGER`, `FINANCE`, `SUPER_ADMIN` in
  `src/modules/auth/roles.ts`; `requireRole(...DESK_ROLES)` guards every route.
- **Provisioning**: `npm run grant-role -- +91... SAFETY_DESK_AGENT`.
  Privileged roles are deliberately **not** grantable over the API — that
  would be a privilege-escalation surface. Keep it that way.
- **Audit**: reads are audited too. Opening the live board writes
  `VIEW_LIVE_BOARD`; opening an incident writes `VIEW_INCIDENT`.
- **API client**: `api.admin.*` is already wired in
  `prototype/shared/api-client.js` and vendored into the website.

**Therefore the Safety Desk portal is a frontend-only task.**

### Ops / Business — NOT built

Driver onboarding approval, document verification, and financial
reconciliation have no tables, no routes, and no UI. This is where the
migration is needed.

---

## 2. Database design — migration `0011_admin_ops.sql`

Two new tables, four columns on `driver_profiles`, one column on `trips`.
Follows the existing file conventions exactly: `DO $$ BEGIN CREATE TYPE ...
EXCEPTION WHEN duplicate_object THEN NULL; END $$;`, `CREATE TABLE IF NOT
EXISTS`, `CREATE INDEX IF NOT EXISTS`.

### 2.1 Driver approval state

```sql
DO $$ BEGIN
  CREATE TYPE onboarding_status AS ENUM
    ('PENDING','UNDER_REVIEW','APPROVED','REJECTED','SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS onboarding_status onboarding_status
    NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

-- Backfill done. New signups must now be reviewed.
ALTER TABLE driver_profiles
  ALTER COLUMN onboarding_status SET DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS idx_driver_onboarding
  ON driver_profiles(onboarding_status)
  WHERE onboarding_status <> 'APPROVED';
```

Two deliberate details:

- **The default flips after the backfill.** Adding the column with
  `DEFAULT 'PENDING'` would instantly suspend every existing seeded driver.
  Existing rows get `APPROVED`; only new rows land in `PENDING`.
- **The index is partial.** The review queue only ever asks for non-approved
  drivers, which is a small minority. A full index would be mostly dead weight.

**The enforcement point is one line in one file.** Dispatch already filters
online drivers at `src/modules/trips/geo-index.ts:95`:

```sql
AND availability = 'ONLINE'
AND onboarding_status = 'APPROVED'   -- add this
```

Every dispatch path routes through that query, so one guard covers all of
them. An approval flag that nothing reads is decoration, not a control.

### 2.2 Driver documents

```sql
DO $$ BEGIN
  CREATE TYPE document_kind AS ENUM
    ('DRIVING_LICENCE','AADHAAR','POLICE_VERIFICATION','PHOTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_status AS ENUM ('SUBMITTED','VERIFIED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS driver_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          document_kind NOT NULL,
  storage_key   TEXT NOT NULL,
  number_last4  VARCHAR(4),
  expires_on    DATE,
  status        document_status NOT NULL DEFAULT 'SUBMITTED',
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  reject_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_documents_driver
  ON driver_documents(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_documents_pending
  ON driver_documents(status) WHERE status = 'SUBMITTED';
```

- `storage_key` points into the same S3 bucket as `inspection_photos`, served
  through the existing presigned-URL provider. The file never transits the DB.
- **`number_last4` only — never the full Aadhaar or licence number.** Storing
  full government ID numbers creates a breach liability with no operational
  benefit; a reviewer verifies against the image, and last-4 is enough to
  match a record afterwards.
- **Deliberately not `UNIQUE(driver_id, kind)`.** A rejected licence gets
  resubmitted. Keeping every submission preserves the rejection history,
  which is the part an audit actually wants.

### 2.3 Payout reconciliation

`trips` already carries `fare_amount`, `platform_fee`, `night_fee`, and
`driver_earnings`. A payout is a grouping over rows that already exist — no
new money fields needed.

```sql
DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('PENDING','APPROVED','PAID','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS driver_payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID NOT NULL REFERENCES users(id),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  trip_count   INT NOT NULL,
  gross        DECIMAL(12,2) NOT NULL,
  platform_fee DECIMAL(12,2) NOT NULL,
  net          DECIMAL(12,2) NOT NULL,
  status       payout_status NOT NULL DEFAULT 'PENDING',
  reference    TEXT,
  approved_by  UUID REFERENCES users(id),
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT driver_payouts_period CHECK (period_end >= period_start)
);

ALTER TABLE trips ADD COLUMN IF NOT EXISTS payout_id
  UUID REFERENCES driver_payouts(id);

CREATE INDEX IF NOT EXISTS idx_trips_unpaid
  ON trips(driver_id, completed_at)
  WHERE payout_id IS NULL AND status = 'COMPLETED';
```

**`trips.payout_id` is the actual double-payment guard.** A
`UNIQUE(driver_id, period_start, period_end)` would not prevent it — two
overlapping periods would each legitimately claim the same trip. Stamping the
trip row is what makes "paid" a property of the trip rather than an inference
from dates. Generating a payout is one transaction:

```sql
BEGIN;
  INSERT INTO driver_payouts (...) RETURNING id;
  UPDATE trips SET payout_id = $1
   WHERE driver_id = $2 AND status = 'COMPLETED'
     AND payout_id IS NULL
     AND completed_at >= $3 AND completed_at < $4;
COMMIT;
```

The `payout_id IS NULL` predicate makes it idempotent under concurrency: a
second run claims zero rows. This is the transaction that a document store
would make you implement by hand, and get wrong.

### 2.4 Deliberately NOT in this migration

| Skipped | Why | Add when |
|---|---|---|
| `payments` table | No payment gateway exists anywhere in the backend. A schema now is guesswork. | A gateway is chosen |
| `corporate_accounts` | Spec mentions B2B but nothing in the codebase references a corporate customer. | The first corporate deal is real |
| `vehicles` / fleet table | `driver_profiles.vehicle_model/plate` exists, and MyDriver drives the *customer's* car — a fleet table may model the wrong thing entirely. | The vehicle-ownership model is settled |
| `admin_audit` table | `audit_log` already does this, append-only, enforced by trigger. | Never — reuse it |
| `agent_shifts` | `user_roles` covers who may sit at the desk. Rostering is an HR problem. | Someone asks for rostering |

---

## 3. Backend — new routes for the Ops half

New module `src/modules/admin-ops/`, following the shape of `safety-desk/`
(`routes.ts` + `service.ts`, Zod schemas, `requireRole` on every route, an
`audit()` call on every mutation and on every document view).

```
GET   /v1/admin/drivers?status=PENDING       OPS_MANAGER, SUPER_ADMIN
GET   /v1/admin/drivers/:id                  → profile + documents + trip stats
POST  /v1/admin/drivers/:id/approve          → APPROVED + audit
POST  /v1/admin/drivers/:id/reject           → REJECTED + reason + audit
POST  /v1/admin/drivers/:id/suspend          → SUSPENDED + audit
GET   /v1/admin/documents/:id/url            → presigned S3 URL + audit VIEW_DOCUMENT
POST  /v1/admin/documents/:id/verify         → VERIFIED | REJECTED + audit

GET   /v1/admin/payouts?status=PENDING       FINANCE, SUPER_ADMIN
POST  /v1/admin/payouts/generate             → the transaction in §2.3
POST  /v1/admin/payouts/:id/approve          FINANCE
POST  /v1/admin/payouts/:id/mark-paid        FINANCE, with reference

GET   /v1/admin/audit?actor=&subject=&from=  SUPER_ADMIN only
```

Role split matters: `FINANCE` must not approve drivers, `OPS_MANAGER` must not
mark payouts paid. `requireRole` already enforces this per route.

---

## 4. Frontend

**Recommendation: `/admin` routes inside `prototype/website`, not a new app.**

Everything needed is already there and working: `AuthContext` (already exposes
`user.role` and `user.roles`), the vendored `api` client with token refresh,
Tailwind 4, React Router 7, `ToastContext`, and the `DashboardLayout` sidebar
pattern to mirror. A separate Vite project would duplicate all of it plus add
a third `sync.sh` target for the API client.

```
src/pages/admin/
  Board.jsx        live board + stats tiles + escalation queue
  Incident.jsx     one escalation: timeline, call, guardians, evidence
  Drivers.jsx      review queue
  DriverDetail.jsx documents, approve/reject
  Payouts.jsx      generate, approve, mark paid
  Audit.jsx        the ledger, SUPER_ADMIN only
src/components/admin/AdminLayout.jsx   sidebar, mirrors DashboardLayout
src/components/admin/RequireRole.jsx   ~8 lines, wraps RequireAuth
```

`RequireRole` renders a 403 panel rather than redirecting — an agent who
mistypes a URL should see why, not get bounced to a customer dashboard.

### The one real gap: the live map

`docs/admin_crm_spec.md` §2 asks for a Mapbox live map. It cannot be built
against the current backend, for two independent reasons:

1. `GET /v1/admin/trips/active` returns **no coordinates** — only names,
   plate, speed ceiling, escalation level, `last_seen`.
2. The WebSocket gateway **rejects desk agents**. `gateway.ts:121` fails any
   `SUBSCRIBE` with `FORBIDDEN_TRIP` unless the caller is the customer or
   driver on that trip. This is correct behaviour for a privacy boundary and
   should not be loosened casually.

**Recommendation: ship the board poll-based first** — 4s interval on the three
admin GETs, `AbortController` on unmount. At the spec's own stated scale
(42 concurrent night trips) this is a few KB every four seconds, and it needs
zero backend change. A real-time map is a separate, deliberate piece of work:
add `last_lat/last_lng` to the active-trips response, then either add a desk
role check in the gateway or give the desk a dedicated read-only fan-out room.

Sequencing the map after the board also means the Safety Desk gets a working
escalation queue in days rather than waiting on a gateway change.

---

## 5. Phasing

| Phase | Contents | Depends on |
|---|---|---|
| **1** | Admin shell: `AdminLayout`, `RequireRole`, Board, Incident. Poll-based. | Nothing — backend is done |
| **2** | `0011_admin_ops.sql` + `admin-ops` module + Drivers/DriverDetail screens | Phase 1 shell |
| **3** | Payouts screens + the generate transaction | Phase 2 |
| **4** | Audit ledger viewer (SUPER_ADMIN) | Phase 2 |
| **5** | Live map — coordinates in the API + a gateway decision | Explicit approval |

Phase 1 ships real operational value with no database change at all.

---

## 6. Testing

- **Migration**: `npm run db:migrate` against a seeded DB; assert existing
  drivers come out `APPROVED` and a newly inserted profile comes out `PENDING`.
- **Dispatch guard**: a `PENDING` driver who is `ONLINE` must receive zero
  offers. This is the test that proves §2.1 is a control and not decoration.
- **Payout idempotency**: run `generate` twice over the same period; the
  second run must claim 0 trips and produce no second payout row.
- **RBAC**: a `FINANCE` token must get 403 on `/v1/admin/drivers/:id/approve`;
  an `OPS_MANAGER` token must get 403 on `/v1/admin/payouts/:id/mark-paid`.
- Existing `vitest` setup; follow `prototype/backend/tests/`.

---

## 7. Open decisions

1. **Scope of the first delivery** — Safety Desk only (Phase 1, no DB change),
   Ops only (Phases 2–3), or both?
2. **App location** — `/admin` inside `prototype/website` (recommended) or a
   separate `prototype/admin` Vite project?
3. **Live map** — accept poll-based for now, or is the map a Phase 1
   requirement? If required, this needs a gateway design decision first.
4. **Document upload path** — do drivers upload KYC documents from the driver
   app (needs a driver-side endpoint too), or does ops upload on their behalf
   during onboarding? This changes Phase 2's size.

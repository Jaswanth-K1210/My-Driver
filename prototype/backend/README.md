# MyDriver Unified Backend — complete

One Fastify + TypeScript service that all four MyDriver clients talk to:
`mobile/user`, `mobile/driver`, `website/` and `app/`.

**All three phases are built.**

| | | |
| --- | --- | --- |
| **Phase 1** | Auth, the Trip lifecycle, Realtime telemetry | ✅ |
| **Phase 2** | Dual-GPS integrity, L0–L5 escalation, guardian links, silent SOS, Safety Desk API | ✅ |
| **Phase 3** | Trip Vault — 8-point inspection, watermarking, immutable archival, PDF certificates | ✅ |

What remains is listed honestly under "Not built yet" — chiefly the Safety Desk
**web client** (the API is done) and wiring the apps to Phases 2 and 3.

Design: `docs/superpowers/specs/2026-08-25-mydriver-unified-backend-design.md`
Plan: `docs/backend-implementation-plan.md`

## Deploying

Production runs from Docker: see [`deploy/README.md`](../../deploy/README.md).
With `NODE_ENV=production` the API refuses to start on development secrets,
mock payment/identity/SMS providers, plain-http URLs or a public `/metrics`.

## Quick start

```bash
cd prototype/backend
cp .env.example .env
npm install
npm run infra:up      # TimescaleDB, PgBouncer, Redis, MinIO
npm run db:migrate
npm run db:seed
npm run dev           # http://localhost:4000
npm test              # 148 tests
```

No API keys are needed. SMS, push, storage and face-liveness all run through
console/in-memory adapters in development; the OTP is printed to stdout.

## Layout

```
src/
  app.ts              buildApp() — the Fastify factory, no listen()
  index.ts            bootstrap, sweeper, draining shutdown
  config/env.ts       zod-validated environment, fails fast at boot
  db/                 pg pool, SQL migration runner, seed
  redis/              command client + pub/sub subscriber factory
  lib/                errors, geo, time, hash, rate-limit, metrics, ids
  providers/          sms · push · storage · liveness  (interface + adapters)
  modules/
    auth/             OTP, JWT, rotating refresh, Google, RBAC
    users/            profile, guardians, DPDP consents
    trips/            state machine, fare, dispatch, handshake, geo index
  telemetry/          bounded buffer -> batched writes to the hypertable
  realtime/           protocol, tickets, hub, WebSocket gateway
packages/api-client/  shared typed client + INTEGRATION.md
```

Modules talk to each other only through exported service functions, never by
reading each other's tables — that is what makes later extraction to separate
services mechanical.

## Endpoints

| Method | Path | Role |
| :--- | :--- | :--- |
| POST | `/v1/auth/otp/request` · `/v1/auth/otp/verify` | — |
| POST | `/v1/auth/google` · `/v1/auth/refresh` · `/v1/auth/logout` | — |
| GET/PATCH | `/v1/me` | any |
| GET/POST/PATCH/DELETE | `/v1/me/guardians[/:id]` | any (max 3) |
| GET/POST | `/v1/me/consents` | any |
| POST | `/v1/trips/quote` · `/v1/trips/book` | CUSTOMER |
| GET | `/v1/trips` · `/v1/trips/:id` | participant |
| POST | `/v1/trips/:id/cancel` | participant |
| POST | `/v1/trips/:id/handshake-otp` · `/v1/trips/:id/rate` | CUSTOMER |
| POST | `/v1/trips/:id/offer/respond` · `/handshake` · `/complete` | DRIVER |
| POST | `/v1/driver/availability` · GET `/v1/driver/summary` | DRIVER |
| GET | `/v1/driver/offers` | DRIVER |
| POST | `/v1/realtime/ticket` | any |
| WS | `/v1/integrity?ticket=…` | any |
| POST | `/v1/trips/:id/sos` | participant |
| POST/DELETE | `/v1/trips/:id/guardian-link` | CUSTOMER |
| GET | `/v1/track/:token` | **public** |
| POST | `/v1/me/devices` | any |
| GET | `/v1/admin/stats` · `/v1/admin/trips/active` · `/v1/admin/escalations` | Safety Desk |
| GET | `/v1/admin/escalations/:id` | Safety Desk |
| POST | `/v1/admin/escalations/:id/acknowledge` · `/promote` · `/resolve` | Safety Desk |
| POST | `/v1/admin/escalations/:id/call` · `/notify-guardians` | Safety Desk |
| POST | `/v1/admin/escalations/:id/release-evidence` | OPS_MANAGER, SUPER_ADMIN |
| POST | `/v1/trips/:id/inspections/:phase` | DRIVER |
| POST | `/v1/trips/:id/inspections/:phase/photos` · `/complete` | DRIVER |
| GET | `/v1/trips/:id/inspections` · `/v1/trips/:id/vault/photos` | participant |
| POST | `/v1/trips/:id/certificate` | participant |
| GET | `/v1/kyc/status` · POST `/v1/kyc/pan` · `/v1/kyc/aadhaar/otp` · `/v1/kyc/aadhaar/verify` | CUSTOMER, DRIVER |
| GET | `/v1/driver/onboarding` · POST `/v1/driver/documents` | DRIVER |
| GET | `/v1/payments/:id/checkout` (hosted page) · POST `/v1/payments/verify` | **public**, signature-authenticated |
| POST | `/v1/payments/webhook` | **public**, HMAC over the raw body |
| GET | `/v1/trips/:id/payment` | participant |
| GET | `/v1/admin/payments` | FINANCE, OPS_MANAGER, SUPER_ADMIN |
| POST | `/v1/admin/payments/:id/refund` | FINANCE, SUPER_ADMIN |
| GET/POST/PATCH/DELETE | `/v1/me/vehicles[/:id]` (Garage, max 10) | any |
| GET | `/v1/catalogue/trip-config` (ETag, 5 min cache) | **public** |
| GET | `/v1/locations/search?q=&lat=&lng=` (cached proxy, 60/min) | any |
| POST | `/v1/trips/:id/telemetry` (background batch, ≤300 points) | participant |
| GET | `/v1/admin/trips` (search) · `/v1/admin/trips/:id` | desk, ops, finance, super admin |
| GET | `/v1/admin/customers` (search) · `/v1/admin/customers/:id` | desk, ops, finance, super admin |
| GET | `/v1/admin/overview?days=7\|30\|90` · `/v1/admin/rate-cards` | ops, finance, super admin |
| PATCH | `/v1/admin/rate-cards/:skill_id` (audited) | finance, super admin |
| GET | `/v1/admin/settings` (demo-data visibility) | console roles |
| GET | `/health` · `/ready` · `/metrics` | — |

Errors are always `{ "error": { "code", "message", "details"? } }`.

## User app support (Garage, places, trip config, background tracking)

**Garage** (`saved_vehicles`, migration 0016). Plates are stored normalised
(`ts09 ab 1234` → `TS09AB1234`) and unique per person; fuel and transmission are
checked against the app's own lists. The first car saved is the default, there
is never more than one default, and deleting the default promotes the oldest
remaining car.

**Location search** (`MAPS_PROVIDER=mock|google`). Google Places Text Search
(New), which returns coordinates in one call. Results are cached in Redis by
normalised query plus the bias point rounded to ~1 km
(`LOCATION_CACHE_TTL_SECONDS`, default 24 h; empty results 10 min), and
identical in-flight searches share one upstream call. Signed-in only, 60
searches per person per minute; an upstream failure is a 503, never a 500.

**Trip config** — requirements with their duration rules, hour packages
(included km from the rate card), pickup times, fees and rate cards. Car makes
and fuel types stay in the app. VisionCam modes are listed with
`available: false`: there is no recording backend, and booking ignores
`vision_mode`.

**Background tracking.** The WebSocket (`/v1/integrity`) is unchanged and is
still the live path. When the app is backgrounded the OS suspends sockets, so a
background location task posts buffered fixes to `POST /v1/trips/:id/telemetry`
with the phone's `sent_at`. Both paths share `telemetry/ingest.ts`: same 1 fix
per second ceiling, same hypertable, same integrity input. Point ages are
rebased onto the server clock, so a phone with a wrong clock neither looks
offline nor files its track at the wrong time. Only the newest point in a batch
moves the live map. `wss://stream.mydriver.in` is a deployment hostname: point
DNS and TLS at this service's `/v1/integrity`; nothing in this repo provisions it.

## Console demo data

`npm run seed:demo` fills the operations console with a realistic month: 40
customers, 25 drivers in every onboarding state, ~360 trips (three live, two
open incidents), payments and refunds, ratings, night check-ins, assessments
to grade and a paid payout. Every demo account is marked `users.is_demo`.

`ADMIN_DEMO_DATA=hide` removes all of it from every console list, count and
chart (the console shows a banner while it is visible). It is hidden, not
deleted, because `trip_events` and `audit_log` are append-only. Production
always hides it and refuses to seed it. Demo drivers are never put online, so
real bookings are never offered to them.

## KYC and payments

**KYC** (`KYC_PROVIDER=mock|cashfree`). PAN is checked against the name the
person gives; Aadhaar uses the provider's OTP flow. Only the last four
characters are ever stored. A driver cannot be APPROVED until PAN, Aadhaar
and an unexpired driving licence are all verified (`approvalBlockers()`); a
driver who finishes their side moves from PENDING to UNDER_REVIEW on their own.
The mock accepts any individual PAN (4th letter `P`) and Aadhaar OTP `123456`.

**Payments** (`PAYMENTS_PROVIDER=none|mock|razorpay`). Booking returns a
`payment` with a `checkout_url`. The trip waits in REQUESTED until the hold is
authorized (checkout callback or webhook), then dispatches. Completion captures
`min(final fare, hold)` and records any overage as `amount_due`; cancel and
NO_DRIVERS_FOUND release the hold; unpaid trips are cancelled after 15 minutes.
`none` skips all of this, and is what the test suite uses unless a test
installs a provider.

## Trip lifecycle

```
REQUESTED --match--> MATCHED --accept--> HANDSHAKE_PENDING --selfie+OTP--> IN_TRIP --> COMPLETED
     |                  |                       |
     +--> NO_DRIVERS_FOUND, CANCELLED <---------+          (ESCALATED: Phase 2)
```

`canTransition()` is the single authority on legal moves. Every transition
writes its `trip_events` row in the same transaction as the status update, and
a database trigger makes `trip_events` physically append-only.

## Phase 2 — the safety subsystem

### The L0–L5 ladder

The source specs reference L0–L5 throughout but never define it. This is the
reading consistent with every concrete mention across the documents:

| | Meaning | Raised by |
| --- | --- | --- |
| **L0** | Nominal | — |
| **L1** | Automated anomaly; guardians notified, event logged | Integrity engine |
| **L2** | Anomaly unacknowledged for 120 s; queued to the desk, **SLA clock starts** | Sweeper |
| **L3** | Human agent engaged, direct contact attempted | Agent |
| **L4** | Emergency — silent SOS or confirmed danger | Customer, driver, or agent |
| **L5** | Law enforcement handoff, evidence packet released | OPS_MANAGER / SUPER_ADMIN |

**Levels only ever rise.** Lowering one would let a mistaken all-clear bury a
real emergency; the way out is to *resolve* the incident, which is a named,
audited act. A trip carries at most one live incident — a second anomaly is more
evidence about one situation, not a competing case. L3 and above mark the trip
itself `ESCALATED`; resolving releases it back to `IN_TRIP`.

The `<3 minutes from L2 to human agent contact` SLA from `admin_crm_spec.md` is
enforced: `sla_deadline` is set at L2 and above, the queue sorts by urgency, and
`mydriver_sla_met_total` / `mydriver_sla_missed_total` record the outcome.

### Dual-GPS integrity

Every instance runs an evaluator over the trips it holds telemetry for, on the
documented 3-second cycle: within 150 m is verified; beyond 150 m for more than
60 s raises `ROUTE_DEVIATION_EXCEEDED`. Speed against the customer's ceiling is
judged from the driver stream alone.

There is **no leader election** — two instances reaching the same conclusion is
fine and deliberate, because that removes the single point of failure from the
safety path. Duplicates are collapsed at the moment of raising by an atomic
Redis claim, with a unique constraint on `anomalies` as the backstop.

A missing customer stream is treated as *unevaluable*, never as a deviation: a
passenger with a dead phone must not be reported as an abduction.

### Guardian links

`POST /v1/trips/:id/guardian-link` issues a signed, expiring, revocable token
resolving to a **public** read-only view: position, speed against the ceiling,
status, and the driver's *first name* and vehicle. No surnames, no phone
numbers, no fare. Views are counted, so who watched a trip is auditable. The
link dies automatically when the trip ends.

### Provisioning a Safety Desk agent

There is deliberately **no API** to grant a privileged role — that would be a
privilege-escalation surface. The person signs in once by OTP, then an operator
runs:

```bash
npm run grant-role -- +919000000001 SAFETY_DESK_AGENT
```

Every grant is written to the append-only `audit_log`.

## Phase 3 — the Trip Vault

### 8-point inspection

`FRONT, REAR, LEFT, RIGHT, DASHBOARD, SEATS, FUEL_ODOMETER, BOOT`, captured
`PRE` and `POST` trip. A zone can be photographed once; an inspection seals only
when all eight are present, because a partial inspection evidences nothing.
Once sealed it accepts nothing further, and `inspection_photos` is append-only
at the database level.

### Watermarking is real, not metadata

Each upload is re-encoded with the trip reference, zone, IST timestamp and
coordinates **burned into the pixels** (via `sharp`), then hashed. The stored
SHA-256 is of the *watermarked* bytes, so altering either the photograph or its
caption changes the digest — and the digest is what the certificate publishes.
A unit test verifies the burn-in by measuring that the caption band is
measurably darker than the original image, rather than trusting a flag.

### Trip certificate

`POST /v1/trips/:id/certificate` renders a real PDF (via `pdfkit`) covering the
route, parties, journey, fare, telemetry and ledger counts, any safety events,
and the SHA-256 of every inspection photo. It states plainly what it evidences
and what it does not. Certificates are **immutable**: re-requesting returns the
document already issued, and the table is append-only.

### Evidence release is now complete

The L5 packet includes the vault contents. `pending` used to be a fixed
apology; it now lists only what is genuinely absent for that particular trip,
and is empty when the vault is populated.

## Dashcam / VisionCam

**Excluded by design.** There is no `mode` column, no video endpoint, and no
VisionCam field anywhere. `POST /v1/trips/book` *rejects* a payload carrying a
`mode` field rather than ignoring it, so the mismatch surfaces during client
integration. Route any VisionCam interface element out to the app website.

## Scaling

Designed for 1,000,000 concurrent users. A tuned Node process holds 50k–100k
WebSockets, so that is **16–24 instances behind a load balancer**, which only
works because nothing here keeps process-local state that affects correctness.

What that required, concretely:

- **PgBouncer** in transaction pooling mode (`docker compose` service on 6432);
  the app pool is capped at 10. Migrations bypass it via `DATABASE_MIGRATION_URL`
  because DDL needs a session-mode connection.
- **HMAC-SHA256 + a server-side pepper**, not a password KDF, for OTPs and
  refresh tokens. Argon2 on the refresh path costs ~60 ms of CPU per call and
  would saturate every core at this scale.
- **Redis Cluster ready.** Channels use the `trip:{id}` hash-tag form so a
  trip's channel and cached state land on one shard. Set `REDIS_CLUSTER=true`
  and pass comma-separated nodes in `REDIS_URL`.
- **Telemetry is batched**, flushed every 2 s or 100 rows, buffer bounded at
  10,000 rows per instance; overflow drops the oldest and increments
  `mydriver_telemetry_dropped_total`.
- **The geo index is throttled** to one write per driver per 10 s. Dispatch does
  not need 3-second precision; this turns ~66k GEOADD/s into ~6.6k.
- **Backpressure over buffering.** Clients are capped at 1 telemetry frame per
  second (excess dropped, not queued) and a socket whose outbound buffer passes
  1 MB is closed with code 1013.
- **Keyset pagination everywhere.** No `OFFSET` in any query.
- **`FOR UPDATE SKIP LOCKED`** in the offer sweeper, so every instance can run
  the loop concurrently instead of serialising.
- **Hypertable with compression** after 7 days and 90-day retention.
- **Draining shutdown**: `/ready` fails first, then connections close, then
  buffered telemetry is flushed. Buffered rows are never discarded.

### The honest limit — now measured

Full results and method: **[`loadtest/README.md`](loadtest/README.md)**.

| Measured | Result |
| --- | --- |
| Concurrent WebSockets | **15,000 on one process, zero failures**, 13 KB marginal RSS each |
| Telemetry write path | **20–30k rows/s** single writer, **60–100k rows/s** with 4 parallel writers |
| HTTP hot paths | 2,000–3,000 req/s at p95 < 55 ms |

At the target load the telemetry path needs roughly **133,000 rows/second**,
which is beyond a single TimescaleDB node on hardware like the test machine. So
the conclusion stands and now has evidence: above that threshold the in-process
buffer must be replaced by a durable stream (Kafka, NATS JetStream or Redis
Streams), or the hypertable sharded. `TelemetryBatchWriter` is isolated behind
one interface so that swap does not touch the gateway, and
`mydriver_telemetry_dropped_total` is the metric that says the threshold was
crossed.

**Caveats that matter.** The load generator shared a laptop with the server, and
Docker Desktop's virtualised disk made write throughput vary ±40% between
identical runs. The socket ceiling was never found — the client exhausted
macOS's 16,384 ephemeral ports first. And **CPU per socket under real telemetry
was not measured**, which is the actual binding constraint on instance count.
The 16–24 instance estimate is consistent with what was measured but remains
unvalidated on the CPU axis.

## Testing

255 tests: pure-function unit tests plus integration tests that run against real
Postgres and Redis via `fastify.inject`, and realtime tests that drive a real
`ws` client against a listening server.

```bash
npm test
npm test -- tests/unit           # fast, no infrastructure
npm run typecheck
```

Integration tests log in through the real OTP flow rather than forging tokens,
so the auth path is exercised on every run.

## Not built yet

Stated plainly so nobody mistakes these for done:

- **Live provider keys.** KYC and payments run on mock adapters until
  `KYC_PROVIDER=cashfree` and `PAYMENTS_PROVIDER=razorpay` are set with real
  keys. The Cashfree endpoint paths in `providers/kyc/cashfree.ts` must be
  confirmed against Cashfree's current docs in sandbox before go-live.
- **Overtime above the hold** is recorded as `payments.amount_due`, not
  charged. A second order for the difference is the upgrade path.
- **Face matching** still uses the mock liveness provider; the selfie is real,
  the comparison is not. `face_reference_key` needs a vendor.
- **Legal pages** (privacy notice, terms, grievance officer) do not exist yet
  and are required before collecting Aadhaar or payments from the public.
- **Masked calling / in-app chat** between rider and driver is not built; the
  buttons were removed rather than left as dead ends.

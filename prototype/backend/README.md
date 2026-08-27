# MyDriver Unified Backend — Phases 1 & 2

One Fastify + TypeScript service that all four MyDriver clients talk to:
`mobile/user`, `mobile/driver`, `website/` and `app/`.

**Phase 1** — Auth, the Trip lifecycle, Realtime telemetry.
**Phase 2** — Dual-GPS integrity, the L0–L5 escalation engine, guardian links,
silent SOS and the Safety Desk API.
**Phase 3** — the Trip Vault. Not built; see "Not built yet" below.

Design: `docs/superpowers/specs/2026-08-25-mydriver-unified-backend-design.md`
Plan: `docs/backend-implementation-plan.md`

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
| GET | `/health` · `/ready` · `/metrics` | — |

Errors are always `{ "error": { "code", "message", "details"? } }`.

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

222 tests: pure-function unit tests plus integration tests that run against real
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

Phase 2: dual-GPS integrity evaluation (3 s haversine loop, 150 m / 60 s
threshold), L0–L5 escalation, guardian link dispatch, silent SOS, the
`ESCALATED` transition, `ANOMALY_TRIGGERED` emission, Admin CRM endpoints.

Phase 3: Trip Vault — 8-point inspection capture, watermarking, immutable
archival, exportable trip certificates.

Known gaps in Phase 1, stated rather than hidden:

- **Push has no device-token storage**, so `getPushProvider().send()` cannot
  reach a real device.
- **`TRIP_OFFER` does not reach the offered driver over the WebSocket.** It is
  published to the trip channel, but the gateway only admits trip participants
  and `trips.driver_id` stays NULL until the offer is accepted — so the driver
  cannot subscribe, and would not know the trip id if they could. Drivers
  discover offers by polling `GET /v1/driver/offers` instead. The frame is
  still published, so a future per-driver channel needs no client change.
- **The `AGENT` role is grantable but has no endpoints.** The agent
  field-recruitment app is out of scope; the enum value exists so the schema
  does not change later.
- **`face_reference_key` is never populated** — driver onboarding is not built —
  so the handshake gates on the mock liveness provider. That provider is a real
  interface with a real confidence threshold rather than a hardcoded `true`.

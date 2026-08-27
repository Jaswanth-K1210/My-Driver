# MyDriver Unified Backend — Phase 1 Design

**Date:** 2026-08-25
**Status:** Approved, ready for implementation planning
**Scope:** Phase 1 — Auth, Trips, Realtime gateway

---

## 1. Purpose

Every MyDriver client today runs on `src/data/mock.js`. Nothing is persisted and nothing
is shared between the web dashboard, the two Expo apps and the (unbuilt) Admin CRM.

This document specifies one unified backend service that all clients talk to. Phase 1
delivers the spine — identity, the trip lifecycle, and the realtime channel — so the
customer and driver apps can complete a booking end to end against real state. The
safety subsystems that define the product (integrity evaluation, L0–L5 escalation,
Trip Vault) are deliberately deferred to Phases 2 and 3 and are called out explicitly
throughout so their seams are built correctly the first time.

### Source documents

- `docs/system_architecture.md` — topology, service decomposition, data model
- `docs/backend_api_spec.md` — endpoint and WebSocket payload contracts
- `docs/mobile_app_spec.md` — client feature surface
- `docs/admin_crm_spec.md` — Safety Desk (Phase 2/3 consumer)
- `docs/ecosystem_integration.mmd` — service and data-store wiring

---

## 2. Decisions

These were settled before design and are not open questions.

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Architecture | TypeScript modular monolith on Fastify | One deployable; module boundaries mirror the doc's five services so any module extracts later without rewriting business logic. Matches the all-JavaScript repo. |
| Data stack | TimescaleDB + Redis + MinIO via Docker Compose | Matches the docs exactly, runs fully offline, and the S3 client works unchanged against real AWS later. |
| External providers | Interface + real adapter + console adapter | Runs today with zero API keys; going live is an env-var change. |
| Dashcam / VisionCam | Zero backend awareness | Excluded from this backend entirely. See §9. |
| Phase 1 scope | Auth + Trips + Realtime | Integrity and escalation in Phase 2; Trip Vault in Phase 3. |
| Identity | One account per phone, role bound at login | A person may hold both CUSTOMER and DRIVER grants; the issued token is scoped to one. |
| Money | Fare calculation only | Fares, fees and driver earnings computed and stored. No gateway, settlement or payouts. |
| Realtime transport | Raw WebSocket, one protocol for all clients | Matches the documented `wss://` endpoint and typed payloads; reliable in React Native; avoids a second framing layer. |
| Client wiring | Backend only, plus a shared typed API client | No edits to `mobile/driver`, `mobile/user` or `website/` in this phase. |

---

## 3. Service layout

Location: `prototype/backend/`

```
prototype/backend/
  docker-compose.yml            # timescaledb, redis, minio
  .env.example
  package.json  tsconfig.json  vitest.config.ts  drizzle.config.ts
  migrations/                   # SQL; raw SQL where Timescale requires it
  src/
    index.ts                    # process bootstrap
    app.ts                      # Fastify factory — takes deps, returns app (testable)
    config/env.ts               # zod-validated environment, fails fast at boot
    db/
      client.ts                 # pool
      schema.ts                 # drizzle schema
    redis/client.ts
    modules/
      auth/
        routes.ts service.ts otp.ts google.ts tokens.ts rbac.ts consent.ts
      users/
        routes.ts service.ts guardians.ts
      trips/
        routes.ts service.ts state-machine.ts matching.ts handshake.ts fare.ts
      telemetry/
        ingest.ts batch-writer.ts
    realtime/
      gateway.ts                # connection lifecycle, ticket auth
      protocol.ts               # zod-typed message union
      hub.ts                    # Redis pub/sub fan-out
    providers/
      sms/{index,twilio,console}.ts
      push/{index,fcm,console}.ts
      storage/{index,s3}.ts
      liveness/{index,mock}.ts
    lib/
      errors.ts geo.ts ids.ts time.ts
  tests/
    unit/ integration/ realtime/
  packages/api-client/          # shared typed client, consumed by all four client apps
```

**Module rule.** A module owns its routes, its service logic and its tables. Modules call
each other only through exported service functions, never by reaching into another
module's tables. This is what makes later extraction to separate services mechanical.

### Technology

Node 26 · Fastify 5 · TypeScript · Zod (`fastify-type-provider-zod` for typed routes and
generated OpenAPI) · Drizzle ORM + drizzle-kit · `@fastify/jwt` · `@fastify/websocket` ·
`@fastify/rate-limit` · `jose` (Google JWKS) · `argon2` (OTP and token hashing) · pino ·
Vitest.

---

## 4. Data model

All Phase 1 tables. Types are PostgreSQL.

### `users`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | UUID PK | `gen_random_uuid()` |
| `phone_number` | VARCHAR(16) UNIQUE NULL | E.164. Nullable only for Google-first signups; required before a trip can be booked or accepted. |
| `email` | CITEXT NULL | |
| `full_name` | TEXT NULL | |
| `google_sub` | TEXT UNIQUE NULL | Google subject id |
| `phone_verified_at` | TIMESTAMPTZ NULL | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### `user_roles`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `user_id` | UUID FK → users | |
| `role` | ENUM | `CUSTOMER`, `DRIVER`, `AGENT`, `ADMIN` |
| `status` | ENUM | `ACTIVE`, `SUSPENDED` |
| `granted_at` | TIMESTAMPTZ | |

PK `(user_id, role)`.

### `driver_profiles`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `user_id` | UUID PK FK → users | |
| `certifications` | TEXT[] | `MD-Standard`, `MD-Auto`, `MD-SUV`, `MD-Lux`, `MD-Night` |
| `night_shield_certified` | BOOLEAN DEFAULT false | |
| `mydriver_score` | DECIMAL(5,2) DEFAULT 100.00 | Rolling 0–100 |
| `rating` | DECIMAL(3,2) NULL | |
| `total_trips` | INT DEFAULT 0 | |
| `vehicle_model` | TEXT NULL | |
| `vehicle_plate` | TEXT NULL | |
| `availability` | ENUM | `OFFLINE`, `ONLINE`, `ON_TRIP` |
| `face_reference_key` | TEXT NULL | Object-storage key of onboarding master photo |

### `otp_challenges`
`id` UUID PK · `phone_number` VARCHAR(16) · `role` ENUM · `code_hash` TEXT ·
`expires_at` TIMESTAMPTZ · `attempts` INT DEFAULT 0 · `consumed_at` TIMESTAMPTZ NULL ·
`request_ip` INET · `created_at` TIMESTAMPTZ.

Index on `(phone_number, created_at DESC)`.

### `refresh_tokens`
`id` UUID PK · `user_id` UUID FK · `role` ENUM (the role this session is scoped to) ·
`token_hash` TEXT UNIQUE · `device_id` TEXT NULL · `expires_at` TIMESTAMPTZ ·
`revoked_at` TIMESTAMPTZ NULL · `replaced_by` UUID NULL · `created_at` TIMESTAMPTZ.

### `consents` (DPDP Act)
`id` UUID PK · `user_id` UUID FK · `purpose` ENUM (`LOCATION_TRACKING`,
`TELEMATICS_COLLECTION`, `GUARDIAN_SHARING`, `BIOMETRIC_LIVENESS`) · `version` TEXT ·
`granted_at` TIMESTAMPTZ · `revoked_at` TIMESTAMPTZ NULL.

### `guardian_contacts`
`id` UUID PK · `user_id` UUID FK · `name` TEXT · `relation` TEXT NULL ·
`phone` VARCHAR(16) · `position` SMALLINT · `created_at` TIMESTAMPTZ.

Unique `(user_id, position)`; `CHECK (position BETWEEN 1 AND 3)` enforces the max of 3.

### `trips`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | UUID PK | |
| `customer_id` | UUID FK → users | |
| `driver_id` | UUID FK → users NULL | Null until MATCHED |
| `status` | ENUM | See §5 |
| `booking_type` | ENUM | `POINT_TO_POINT`, `HOURLY` |
| `hourly_package_hours` | SMALLINT NULL | 2, 4, 8 or 12 when HOURLY |
| `pickup_lat`, `pickup_lng` | DOUBLE PRECISION | |
| `pickup_address` | TEXT | |
| `drop_lat`, `drop_lng` | DOUBLE PRECISION NULL | Null when HOURLY |
| `drop_address` | TEXT NULL | |
| `required_certification` | TEXT | e.g. `MD-Night` |
| `speed_ceiling_kmh` | INT | Customer-configured |
| `pickup_handshake_otp_hash` | TEXT | 4-digit code, hashed |
| `distance_km` | DECIMAL(7,2) NULL | |
| `duration_min` | INT NULL | |
| `fare_amount` | DECIMAL(10,2) NULL | |
| `platform_fee` | DECIMAL(10,2) NULL | |
| `night_fee` | DECIMAL(10,2) NULL | |
| `driver_earnings` | DECIMAL(10,2) NULL | |
| `cancellation_reason` | TEXT NULL | |
| `requested_at`, `matched_at`, `handshake_at`, `started_at`, `completed_at`, `cancelled_at` | TIMESTAMPTZ | Nullable except `requested_at` |

Indexes: `(customer_id, requested_at DESC)`, `(driver_id, requested_at DESC)`,
partial index on `status` for active trips.

### `trip_events` — append-only
`id` UUID PK · `trip_id` UUID FK · `type` TEXT · `actor_id` UUID NULL ·
`actor_role` ENUM NULL · `payload` JSONB · `created_at` TIMESTAMPTZ.

No UPDATE or DELETE is ever issued against this table. It is the lifecycle ledger and
the foundation the Phase 3 Trip Vault seals.

### `trip_offers`
`id` UUID PK · `trip_id` UUID FK · `driver_id` UUID FK · `round` SMALLINT ·
`status` ENUM (`PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED`) · `sent_at` TIMESTAMPTZ ·
`expires_at` TIMESTAMPTZ · `responded_at` TIMESTAMPTZ NULL.

### `telematics_logs` — TimescaleDB hypertable
| Column | Type | Notes |
| :--- | :--- | :--- |
| `time` | TIMESTAMPTZ NOT NULL | Hypertable partition key |
| `trip_id` | UUID NOT NULL | |
| `source` | ENUM | `DRIVER`, `CUSTOMER` |
| `lat`, `lng` | DOUBLE PRECISION | |
| `speed_kmh` | REAL NULL | |
| `heading` | REAL NULL | |
| `accel_z`, `gyro_z` | REAL NULL | Driver source only |

`SELECT create_hypertable('telematics_logs', 'time', chunk_time_interval => INTERVAL '1 day')`.
Index on `(trip_id, time DESC)`.

### `rate_cards`
`skill_id` TEXT PK · `label` TEXT · `per_km_rate` DECIMAL(6,2) ·
`hourly_rate` DECIMAL(6,2) · `included_km_per_hour` SMALLINT · `active` BOOLEAN.

Seeded from the `SKILLS` array in `website/src/data/mock.js`.

### `driver_ratings`
`trip_id` UUID PK FK · `rating` SMALLINT CHECK 1–5 · `comment` TEXT NULL ·
`created_at` TIMESTAMPTZ.

---

## 5. Trip lifecycle

```
REQUESTED ──match──► MATCHED ──driver accepts──► HANDSHAKE_PENDING
                                                        │
                                              selfie + OTP verified
                                                        ▼
                                                     IN_TRIP ──► COMPLETED
Terminal from REQUESTED:                 NO_DRIVERS_FOUND
Terminal from REQUESTED / MATCHED /
HANDSHAKE_PENDING:                       CANCELLED
Reserved for Phase 2, from IN_TRIP:      ESCALATED
```

A single pure function `canTransition(from, to): boolean` is the only authority on legal
moves. Every guarded transition writes its `trip_events` row inside the same database
transaction as the `trips.status` update, so the ledger can never drift from the state.

### Matching

1. Online drivers are held in a Redis GEO index (`drivers:online`), updated on
   availability change and on each telemetry frame.
2. On booking: `GEOSEARCH` within 5 km of pickup, filtered to drivers whose
   `certifications` contain `required_certification`.
3. Rank by distance ascending, then `mydriver_score` descending.
4. Offer to the top candidate with a 20-second TTL, delivered over WebSocket and via the
   push provider. On decline or expiry, move to the next candidate.
5. Three rounds maximum, then the trip moves to `NO_DRIVERS_FOUND`.

Offer expiry is driven by a Redis keyspace TTL with a periodic sweeper as backstop, so a
crashed instance cannot strand a trip in `REQUESTED`.

### Handshake

`POST /v1/trips/:id/handshake` — the assigned driver submits a selfie and the customer's
spoken 4-digit code. The server verifies, in order: caller is `trips.driver_id`; status is
`HANDSHAKE_PENDING`; OTP matches `pickup_handshake_otp_hash` (after 5 failed attempts the handshake locks
permanently and the trip can only be cancelled, not started); the liveness provider matches the selfie
against `driver_profiles.face_reference_key`. The selfie is written to object storage and
its key recorded on the `trip_events` row. On success the trip moves to `IN_TRIP`.

### Fare

```
base      = booking_type = HOURLY
              ? hourly_rate × hours
              : per_km_rate × distance_km
night_fee = pickup between 22:00 and 05:00 IST ? 30 : 0
fare      = base + 19 (platform fee) + night_fee
driver_earnings = fare − platform_fee
```

Rates come from `rate_cards`. Fare is computed and frozen at `COMPLETED`; the quote shown
at booking time is computed by the same pure function from the estimated distance.

**Distance.** Phase 1 uses no external routing provider. The booking-time estimate is
straight-line haversine between pickup and drop multiplied by a 1.35 road factor. The
final `distance_km` at completion is the cumulative haversine sum over that trip's
`DRIVER`-source rows in `telematics_logs`. Swapping in a real routing provider later is a
change to one function behind the same interface, and is noted as a Phase 2 candidate.

---

## 6. API surface (Phase 1)

All responses are JSON. Errors are uniform: `{ "error": { "code", "message", "details"? } }`.

### Auth
| Method | Path | Notes |
| :--- | :--- | :--- |
| POST | `/v1/auth/otp/request` | `{ phone_number, role }` → `{ status, expires_in }`. Rate limited. |
| POST | `/v1/auth/otp/verify` | `{ phone_number, otp, role, device_id? }` → tokens + user. Creates the user and grants the role on first verify. |
| POST | `/v1/auth/google` | `{ id_token, role }` — verified against Google JWKS. See linking rule below. |
| POST | `/v1/auth/refresh` | Rotating refresh; reuse of a consumed token revokes the whole chain. |
| POST | `/v1/auth/logout` | Revokes the presented refresh token. |

Access token 15 min, refresh token 30 days. Claims: `sub`, `role`, `jti`.

**Google account linking.** Match on `google_sub` first. If no match, and the token's
`email_verified` claim is true and that email already belongs to a user, link the
`google_sub` to that existing user. Otherwise create a new user with no phone number, in
which case `phone_number` is nullable until the user verifies one — a Google-only account
cannot be dispatched a trip until a phone number is verified, because the handshake and
guardian flows require it.

### Users
`GET /v1/me` · `PATCH /v1/me` · `GET|POST|PATCH|DELETE /v1/me/guardians` (max 3) ·
`GET|POST /v1/me/consents`.

### Trips
| Method | Path | Role |
| :--- | :--- | :--- |
| POST | `/v1/trips/quote` | CUSTOMER — fare estimate, no record created |
| POST | `/v1/trips/book` | CUSTOMER |
| GET | `/v1/trips/:id` | Participant only |
| GET | `/v1/trips` | Paginated history for the caller |
| POST | `/v1/trips/:id/cancel` | CUSTOMER or DRIVER, with reason |
| POST | `/v1/trips/:id/offer/respond` | DRIVER — accept or decline |
| POST | `/v1/trips/:id/handshake` | DRIVER |
| POST | `/v1/trips/:id/complete` | DRIVER |
| POST | `/v1/trips/:id/rate` | CUSTOMER |

### Driver
`POST /v1/driver/availability` · `GET /v1/driver/summary` (score, today's earnings, trip count).

### Realtime
`POST /v1/realtime/ticket` — see §7.

**Note on the booking contract:** `POST /v1/trips/book` does **not** accept a `mode`
field. See §9.

---

## 7. Realtime

### Connection and authentication

A JWT placed in a WebSocket query string leaks into every proxy log and access log, and
browsers cannot set custom headers on a WebSocket handshake. Therefore:

1. Client calls `POST /v1/realtime/ticket` with its bearer token.
2. Server returns a single-use opaque ticket, stored in Redis with a 60-second TTL.
3. Client connects to `wss://<host>/v1/integrity?ticket=<ticket>`.
4. Gateway atomically consumes the ticket (`GETDEL`), resolves the user and role, and
   binds them to the connection. An invalid or already-consumed ticket closes the socket.

Heartbeat: server sends `PING` every 30 seconds; a connection missing two consecutive
`PONG` replies is closed. Clients reconnect with exponential backoff and jitter.

### Protocol

Every frame is a JSON object with a `type` discriminant, validated by a Zod union.

Client → server:
```json
{ "type": "SUBSCRIBE", "trip_id": "…" }
{ "type": "DRIVER_TELEMETRY", "trip_id": "…", "timestamp": 1787305851236,
  "coords": { "lat": 17.4399, "lng": 78.3813, "speed": 48.5, "heading": 182.4 },
  "sensors": { "accel_z": 0.12, "gyro_z": 0.04 } }
{ "type": "CUSTOMER_TELEMETRY", "trip_id": "…", "timestamp": …,
  "coords": { "lat": …, "lng": … } }
{ "type": "PONG" }
```

Server → client:
```json
{ "type": "SUBSCRIBED", "trip_id": "…" }
{ "type": "TRIP_OFFER", "trip_id": "…", "expires_at": …, "pickup": {…}, "fare_estimate": … }
{ "type": "TRIP_STATE_CHANGED", "trip_id": "…", "status": "IN_TRIP" }
{ "type": "DRIVER_LOCATION", "trip_id": "…", "coords": {…} }
{ "type": "PING" }
{ "type": "ERROR", "code": "…", "message": "…" }
```

`ANOMALY_TRIGGERED` is reserved and documented now, emitted in Phase 2.

### Authorisation

A connection may only `SUBSCRIBE` to a trip it participates in. `DRIVER_TELEMETRY` is
accepted only from the connection bound to `trips.driver_id`; `CUSTOMER_TELEMETRY` only
from `trips.customer_id`. Frames for a trip not in `IN_TRIP` or `HANDSHAKE_PENDING` are
rejected.

### Write path

```
frame → validate → Redis GEOADD + SET trip:{id}:last:{source}
      → PUBLISH trip:{id}                     (fan-out across instances)
      → in-memory buffer → flush every 2s or 100 rows → COPY into telematics_logs
```

Fan-out goes through Redis pub/sub rather than in-process sockets so that horizontal
scaling works from day one.

**Phase 1 stores and fans out telemetry. It does not evaluate it.** The 3-second haversine
co-location loop, the 150 m / 60 s threshold and L1 anomaly emission are Phase 2, and they
attach as an additional subscriber to the `trip:{id}` channel. That subscriber boundary is
the reason this write path is specified now.

---

## 8. Providers

Each external dependency is an interface with two implementations, selected by env var.

| Provider | Interface | Real | Dev default |
| :--- | :--- | :--- | :--- |
| SMS | `send(to, body)` | Twilio / Exotel | Console — prints the OTP to stdout |
| Push | `send(deviceToken, payload)` | FCM / APNS | Console — logs the payload |
| Storage | `put(key, buf, mime)`, `signedUrl(key)` | AWS S3 | MinIO via the same S3 client |
| Liveness | `verify(selfie, referenceKey)` | Vendor | Mock — configurable confidence |

No API key is required to run the service or its tests.

---

## 9. Dashcam / VisionCam exclusion

The VisionCam feature is **out of scope for this backend entirely**. The backend has no
awareness that a dashcam exists:

- No `mode` column on `trips`, and no VisionCam mode enum anywhere in the schema.
- No video upload, streaming, storage, transcode or playback endpoints.
- No VisionCam fields in any API request or response.

`POST /v1/trips/book` therefore does not accept a `mode` field. Requests containing one
are rejected by schema validation rather than silently ignored, so the mismatch surfaces
immediately during client integration.

**Known client-side consequence, not addressed in this phase:** the booking flows in
`website/` and `app/` currently collect and send a VisionCam mode, and the marketing site
describes Mode R / D / F. Those clients must stop sending `mode` and route any
VisionCam-related interface element out to the app website. This is a client task,
tracked separately from this backend plan.

---

## 10. Deviations from the source documents

Each is a deliberate correction, approved during design.

1. **Login OTP is 6 digits**, not the 4 in `backend_api_spec.md` — the login screens in
   `mobile/user` and `mobile/driver` render six input boxes. The **handshake** OTP remains
   4 digits, matching `system_architecture.md` and the prototype's demo code, because it
   is spoken aloud at the vehicle.
2. **`users.role` becomes a `user_roles` table.** The single-ENUM column cannot express
   one phone number holding both a CUSTOMER and a DRIVER grant.
3. **Driver fields move to `driver_profiles`.** `night_shield_certified` and
   `mydriver_score` are meaningless on a customer row.
4. **`trips.mode` is dropped** (§9).
5. **`CANCELLED` and `NO_DRIVERS_FOUND` added** to the lifecycle. The documented six
   states offer no way to terminate an unmatched or abandoned booking.
6. **OTPs and refresh tokens are stored hashed**, never in plaintext.
7. **`booking_type` added to `trips`.** The booking UI offers hourly hire packages;
   the API spec models only point-to-point.
8. **Raw WebSocket replaces socket.io** for the Admin CRM, resolving the conflict between
   `admin_crm_spec.md` and the mobile and API specs in favour of one protocol.
9. **WebSocket authentication uses a short-lived ticket**, not a JWT in the connection
   URL (§7).

---

## 11. Testing

Test-driven throughout: a failing test precedes each unit of behaviour.

**Unit** — the transition function, the fare engine, haversine and geo helpers, OTP
generation and hashing, token rotation logic, the protocol Zod union. Pure functions, no
I/O, fast.

**Integration** — `fastify.inject` against real PostgreSQL and Redis from Compose. A
dedicated test database is migrated once per run and truncated between tests. Covers each
endpoint's success path, its authorisation failures, and its validation failures.

**Realtime** — a real `ws` client against a running app instance: ticket consumption,
unauthorised subscribe attempts, telemetry authorisation, fan-out to a second connected
client, heartbeat timeout, and reconnect.

**Lifecycle** — one end-to-end integration test walking book → offer → accept → handshake
→ telemetry → complete → rate, asserting both the resulting state and the full
`trip_events` ledger.

---

## 12. Out of scope for Phase 1

Deferred, with their seams built:

- **Phase 2 — SHIPPED (2026-08-27).** Dual-GPS integrity evaluation (3s haversine loop,
  150 m / 60 s threshold), L0–L5 escalation engine, guardian link dispatch, silent SOS,
  `ESCALATED` state, `ANOMALY_TRIGGERED` emission, and the Safety Desk API. The L0–L5
  ladder was undefined in the source documents; the definition used is recorded in
  `prototype/backend/README.md` and implemented in `src/modules/escalation/levels.ts`.
  No Safety Desk **web client** was built — API only.
- **Phase 3 — SHIPPED (2026-08-28).** Trip Vault: 8-point inspection capture, watermarking
  burned into the pixels, immutable archival with tamper-evident SHA-256 digests, exportable
  trip certificate PDFs, and the completed L5 evidence release.
- **Unscheduled** — Agent field-recruitment onboarding API, corporate accounts, financial
  reconciliation, payment gateway and driver settlement, VisionCam (permanently excluded
  from this service).

Client integration is also out of scope: this phase ships `packages/api-client` with typed
methods and the WebSocket protocol, plus an integration guide mapping each call to the
mock it replaces. No client files are edited.

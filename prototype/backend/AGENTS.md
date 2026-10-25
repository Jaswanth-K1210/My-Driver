# AGENTS.md — Backend (`prototype/backend`)

**Owner: Jaswanth.** This file adds area-specific rules on top of the team rules in the root [`AGENTS.md`](../../AGENTS.md). Read that one first; if the two ever conflict, the root file wins. Jaswanth may change this file; changes to the root file need all three developers to agree.

## Stack
- Fastify 5 + TypeScript + Zod.
- PostgreSQL 16 / TimescaleDB (through PgBouncer), Redis 7, MinIO/S3.
- Source layout:
  - `src/modules/<domain>/`: `admin-ops`, `admin-support`, `auth`, `catalogue`, `driver-app`, `escalation`, `guardian`, `integrity`, `kyc`, `locations`, `payments`, `safety-desk`, `trips`, `users`, `vault`.
  - `src/providers/<kind>/`: `kyc`, `liveness`, `maps`, `payments`, `push`, `sms`, `storage`, `voice`.
  - Also `src/realtime/` (WebSocket hub, ops feed), `src/db/`, `src/redis/`, `src/telemetry/`.

## Checks before every commit
```bash
npm run typecheck        # tsc --noEmit
npm run infra:up         # Docker: Postgres (5433), Redis, MinIO; needed for tests
npm run db:migrate
npm test                 # vitest (integration tests need the Docker DB)
```
If Docker isn't available, say so in `progress.md`; never claim the tests passed.

## Area rules
1. **Contract first: the apps depend on you.**
   - Any change to a request or response schema, or a WebSocket frame, is merged **before** the apps rely on it.
   - Announce it in the `progress.md` entry under **"Payload changed:"**.
   - Prefer additive changes (new optional fields). Never remove or rename a field the apps use without a `REQUEST`-style heads-up to Sanath and Umesh in `tasks.md`.
2. **Zod response schemas strip unknown fields.** When you add data to a response, add it to the route's `response` schema too, or the apps never receive it.
3. **Every trip state change is broadcast** over the hub (`TRIP_STATE_CHANGED`, etc.) to the customer, the driver and the ops feed, including state changes made from the console (e.g. resolving an escalation).
4. **Migrations:**
   - New files only, numbered after the latest (`0020_…` is current), in `migrations/`.
   - Never edit a migration that has been pushed.
   - Each migration must work on a database that already has data.
5. **Money stays exact:** amounts are integers in paise or rupees, as the existing code does. Payments and webhooks stay idempotent. Fees come from `pricing_fees` / rate cards, never from constants.
6. **Providers:**
   - Every external service goes through `src/providers/<kind>/` with a `mock`/`console` adapter for development.
   - Live keys come from environment variables only.
   - Push: don't delete device tokens on generic errors; iOS tokens need the APNs path (decision D-1).
7. **Hot paths:** offer polling and telemetry run every few seconds per driver. Keep the Redis fast paths (offer hint, `isIndexed`) ahead of any Postgres query.
8. **API docs:** after changing routes, run `npm run docs:api` to regenerate `api-documentation.md` at the repo root, in the same commit.
9. **Secrets:** `.env` stays out of git. Update `.env.example` (and `deploy/.env.production.example`) when you add a variable.

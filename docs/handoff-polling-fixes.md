# Handoff: polling cost fixes (uncommitted)

Logged 2026-10-10 on branch `production-p1`, base commit `8a726b3`.

Six fixes that cut background load on the API, Postgres and Redis are written
in the working tree but **not committed and not fully tested**. Most of the
code is backend and console, which `tasks.md` assigns to Jaswanth, so he should
review it before it merges.

## Status

| Check | Result |
|---|---|
| Backend typecheck (`npm run typecheck`) | Passed |
| Backend unit tests (`npx vitest run tests/unit`) | Passed, 82 tests |
| Backend integration tests (`npm test`) | Passed, 354 tests in 32 files (later the same day) |
| Website lint (CI oxlint command) after the `Board.jsx` change | Passed |
| New audit-throttle test in `tests/integration/staff-login.test.ts` | Passed |

Still uncommitted, and still waiting for Jaswanth's review.

Two things were needed to get the suite running:

- `minio/minio` can no longer be pulled from Docker Hub or quay.io, so
  `npm run infra:up` failed for everyone on a fresh machine. The dev compose
  file now uses `cgr.dev/chainguard/minio:latest`. Tests do not need MinIO
  (they use in-memory storage, as CI does).
- If a Redis container was created while port 6380 was taken, it starts with
  no published port and every test times out. `docker compose up -d
  --force-recreate redis` fixes it.

## What changed

| # | Fix | Files |
|---|---|---|
| 1 | Offer polls skip Postgres unless dispatch has raised a Redis flag (`offer:pending:<driverId>`). The flag is set just before the offer row is written and expires 10 s after the offer. | new `backend/src/modules/trips/offer-hint.ts`; `trips/matching.ts`; `trips/service.ts` |
| 2 | Live map and live board are audited once per agent per screen per 15 minutes (`audit:view:<action>:<agentId>`), not on every poll. If Redis is unreachable it audits every time. | `safety-desk/service.ts` (`auditView`); `safety-desk/routes.ts` |
| 3 | Live driver list cached in Redis for 3 s, shared by all agents, keyed by demo visibility. | `safety-desk/service.ts` |
| 4 | Live board polls every 10 s instead of 4 s. | `website/src/pages/admin/Board.jsx` |
| 5 | Trip-roles cache TTL 5 s to 60 s. Added the missing cache invalidation after the three escalation paths that change `trips.status`. | `realtime/gateway.ts`; `trips/broadcast.ts` (comment); `escalation/service.ts` |
| 6 | Five polled routes no longer write a request log line (`logLevel: 'warn'`): `/v1/driver/offers`, `/v1/admin/stats`, `/v1/admin/drivers/live`, `/v1/admin/trips/active`, `/v1/admin/escalations`. | `trips/routes.ts`; `safety-desk/routes.ts` |
| - | Production Redis gets `--maxmemory ${REDIS_MAXMEMORY:-512mb}` and `volatile-lru`. | `deploy/docker-compose.prod.yml`; `deploy/.env.production.example` |
| - | Test Redis reset also clears `audit:*`; one new integration test for the audit throttle. | `backend/tests/helpers/redis.ts`; `backend/tests/integration/staff-login.test.ts` |

## Decisions to review

- **Fix 5 uses 60 s, not a whole-trip cache.** The TTL is a backstop for any
  status change that forgets to invalidate. Whoever adds a new write to
  `trips.status` must call `invalidateTripCache`.
- **Fix 1 is a stopgap.** The cure is push notifications for offers: the
  driver app registers the device and listens; the backend already calls the
  push provider in `matching.ts`, but FCM keys and delivery are on Jaswanth's
  list.
- **Fix 4 took the simple route** (slower polling) instead of one combined
  endpoint.

## Open items

1. Run the integration suite and the website lint; fix anything they find.
2. Jaswanth reviews, then commit and push.
3. **Bug, reproduced and fixed (needs Jaswanth's review: it is the safety
   path).** The gateway and the batch telemetry route accepted location only
   while a trip was `IN_TRIP` or `HANDSHAKE_PENDING`. An L3+ escalation
   (including silent SOS) sets the trip to `ESCALATED`, so every location frame
   was rejected with `TRIP_NOT_ACTIVE` for as long as the incident was open.
   Both checks now call `acceptsTelemetry()` in `trips/state-machine.ts`, which
   includes `ESCALATED`. Two new tests cover it (`app-upgrade.test.ts`,
   `gateway.test.ts`); both fail with 409 without the fix. The driver app had
   the matching gap (it dropped an `ESCALATED` trip on restart) and is fixed
   too.
4. Still on the driver app list and related to this work: push notifications
   for offers (removes the 2.5 s poll in
   `mobile/driver/src/context/DriverContext.jsx`).

## How to verify

Docker Desktop must be running and able to reach Docker Hub.

```powershell
cd D:\MyDriver\My-Driver\prototype\backend
npm run infra:up; npm run db:migrate; npm test

cd ..\website
npx oxlint --deny-warnings -A react-hooks/exhaustive-deps -A react/only-export-components -A react/set-state-in-effect src
```

Not to be committed: `prototype/backend/package-lock.json` has an unrelated
local change.

# MyDriver

MyDriver is a trusted driver-as-a-service platform: a verified driver drives the customer's own
car, and every trip is recorded and watched. This folder holds the full Phase 1 stack, which is
one backend and four clients.

| Doc | What it covers |
|---|---|
| [`../prd.md`](../prd.md) | Product requirements for Phase 1 |
| [`../tasks.md`](../tasks.md) | Open and finished work, by owner |
| [`../api-documentation.md`](../api-documentation.md) | API reference: auth, errors, payments, WebSocket, all endpoints |
| [`../docs/production-cost-analysis.md`](../docs/production-cost-analysis.md) | Running costs by scale |
| [`deploy/README.md`](deploy/README.md) | Production deployment |

## What's inside

| Folder | What it is |
|---|---|
| `backend/` | Fastify + TypeScript API on Postgres/TimescaleDB, PgBouncer, Redis and MinIO/S3 |
| `website/` | One codebase with two builds: the customer site (`dist/`) and the operations console (`dist-admin/`, served at admin.mydriver.in) |
| `mobile/user/` | Customer app (Expo SDK 57, React Native 0.86) |
| `mobile/driver/` | Driver app (Expo SDK 57, React Native 0.86) |
| `shared/` | The API client, copied into each app. Edit `shared/api-client.js` and re-sync the copies |
| `deploy/` | Production Docker Compose, Caddy (automatic TLS), env template |
| `app/` | Older combined web demo on mock data, kept as a design reference |

## Quick start

```bash
# 1. Backend (http://localhost:4000)
cd prototype/backend
cp .env.example .env
npm install
npm run infra:up                 # TimescaleDB, PgBouncer, Redis, MinIO (Docker)
npm run db:migrate && npm run db:seed
npm run seed:demo                # optional: demo customers, drivers, trips, live map
npm run seed:staff               # console accounts -> ../../credentials.md (gitignored)
npm run dev

# 2. Customer site (http://localhost:5173) and console (http://localhost:5174/login)
cd prototype/website && cp .env.example .env && npm install
npm run dev
npm run dev:admin

# 3. Mobile apps (Expo)
cd prototype/mobile/user   && npm install && npm start
cd prototype/mobile/driver && npm install && npm start
```

Development needs no API keys. KYC, payments, maps, SMS, push, voice, storage and liveness all
run on mock or console adapters, and the production config refuses to boot with any of them.

- **OTP:** no SMS is sent. The code is printed in the backend log:
  `[sms:console] -> +919876543210: 481920 is your MyDriver verification code.`
- **Payments:** the mock checkout page has Approve and Decline buttons.
- **Phones:** the mobile apps find the backend through the Expo dev server's host. Set
  `EXPO_PUBLIC_API_URL` if you need a tunnel.
- **Demo data:** `ADMIN_DEMO_DATA=show|hide` controls whether the console shows it. Demo drivers
  are never dispatched to real bookings.
- **Phase toggles:** bus, caravan, scheduled pickup and full-time contracts are built but off
  (`website/src/lib/features.js`, `mobile/user/src/lib/features.js`).

## Checks

```bash
cd prototype/backend && npx tsc --noEmit && npm test     # 342 tests (wipes the dev database; reseed after)
cd prototype/website && npm run lint && npm run check && npm run build && npm run build:admin
node prototype/shared/smoke-test.mjs                     # end-to-end through the real client
cd prototype/backend && npm run docs:api                 # regenerate the endpoint reference
```

CI (`../.github/workflows/ci.yml`) runs the backend tests and the website lint and builds on every
pull request.

## Google sign-in

Phone OTP works on its own. Google sign-in turns on once these client IDs are set:

| Where | Variable |
|---|---|
| `backend/.env` | `GOOGLE_CLIENT_IDS`: all client IDs, comma-separated |
| `website/.env` | `VITE_GOOGLE_CLIENT_ID`: the Web client ID |
| `mobile/user/.env`, `mobile/driver/.env` | `EXPO_PUBLIC_GOOGLE_CLIENT_ID`: the iOS/Android client ID |

## Design system

The palette is red (`#E01E26`) and neutrals only. Primary actions are solid red. Danger states
are red-tinted surfaces with a warning icon, and "safe" is graphite with a check rather than
green. The tokens are in `mobile/*/src/theme/tokens.js` and in the `@theme` block of
`website/src/index.css`. The rationale is in
`../docs/superpowers/specs/2026-08-21-mydriver-mobile-design.md`.

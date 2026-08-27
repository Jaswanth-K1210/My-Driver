# MyDriver

A working MyDriver stack: a real backend with three clients wired to it.

## What's inside

| Folder            | What it is                                                    | Backend?           |
| ----------------- | ------------------------------------------------------------- | ------------------ |
| `backend/`        | Fastify + TypeScript API — auth, trips, realtime telemetry     | **is** the backend |
| `website/`        | Marketing site + customer dashboard (Vite + React 19)          | **connected**      |
| `mobile/user/`    | Customer app (Expo SDK 57 + React Native 0.86)                 | **connected**      |
| `mobile/driver/`  | Driver app (Expo SDK 57 + React Native 0.86)                   | **connected**      |
| `app/`            | Older combined customer+driver web demo                        | mocks only         |
| `shared/`         | Canonical API client, vendored into the three connected apps   | —                  |

`app/` is deliberately left on mock data: `mobile/user` and `mobile/driver` now
own those flows properly, so wiring it would mean maintaining the same screens
twice. It remains a useful offline design reference.

## Quick start

The backend must be running first — the three connected apps have no mock
fallback for auth or trips.

```bash
# 1. Backend + infrastructure
cd prototype/backend
cp .env.example .env
npm install
npm run infra:up          # TimescaleDB, PgBouncer, Redis, MinIO
npm run db:migrate && npm run db:seed
npm run dev               # http://localhost:4000

# 2. Website
cd prototype/website && cp .env.example .env && npm install && npm run dev

# 3. Customer app          # 4. Driver app
cd prototype/mobile/user   #    cd prototype/mobile/driver
npm install && npm start   #    npm install && npm start
```

No API keys are needed. SMS, push, storage and face-liveness all run through
console/in-memory adapters in development.

**Reading the OTP:** there is no real SMS in development. The 6-digit code is
printed to the backend's stdout:

```
[sms:console] -> +919876543210: 481920 is your MyDriver verification code.
```

**Mobile on a real device:** the apps derive the backend URL from the Expo dev
server's host, so Expo Go on your phone reaches your laptop automatically. No IP
editing. Override with `EXPO_PUBLIC_API_URL` if you need a tunnel.

## Verifying the whole stack

```bash
cd prototype/backend && npm test          # 222 tests
node prototype/shared/smoke-test.mjs      # 54 checks, end to end through the real client
```

The smoke test drives login → booking → dispatch → handshake → telemetry →
completion → rating → guardian link → silent SOS → Safety Desk triage →
resolution → history, using the same client the apps use.

## Google sign-in

Not yet active. Create OAuth clients in Google Cloud Console → Credentials and
add the IDs in **two** places:

| Where | Variable |
| ----- | -------- |
| `backend/.env` | `GOOGLE_CLIENT_IDS` — comma-separated, **all three** IDs |
| `website/.env` | `VITE_GOOGLE_CLIENT_ID` — the **Web** client ID |
| `mobile/user/.env`, `mobile/driver/.env` | `EXPO_PUBLIC_GOOGLE_CLIENT_ID` — the iOS/Android ID |

Until then the Google buttons explain they are unconfigured, and phone OTP works
fully. The backend's Google path is built and tested — it activates on config
alone.

## What is real and what is not

Everything the Phase 1 backend supports is live: login, booking, fare quoting,
dispatch, driver acceptance, the pickup handshake, live location, trip
completion, ratings, guardians and trip history.

These screens carry a visible **Demo** badge because their backend is not built
yet — nothing is deleted, and Phase 2/3 drops in behind them:

| Feature | Waiting on |
| ------- | ---------- |
| 8-point inspection capture | Trip Vault — Phase 3 |
| Trip certificate export | Trip Vault — Phase 3 |
| Silent SOS, guardian link dispatch | **Backend built (Phase 2)** — clients not wired yet |
| Speed-breach / anomaly alerts | **Backend built (Phase 2)** — clients not wired yet |
| VisionCam mode picker | **Permanently excluded** from this backend |

Phase 2 shipped the safety subsystem on the backend: dual-GPS integrity
evaluation, the L0–L5 escalation ladder, guardian tracking links, silent SOS and
the Safety Desk API. The shared client exposes all of it (`client.trips.sos`,
`client.trips.guardianLink`, `client.track`, `client.admin.*`), but the app
screens still run their local simulations, so those badges stay until the
clients are wired.

The VisionCam exclusion is enforced, not merely documented: the backend rejects
a booking carrying a `mode` field rather than ignoring it.

## Design system

Red and white, and nothing else. Red (`#E01E26`) is the only chromatic colour in the
system: it carries brand, primary actions and critical alerts alike. Danger is
distinguished from a primary action by *treatment* rather than hue — primary actions
are solid red fills, danger states are red-tinted surfaces with a warning icon, and
"safe / clean" reads as graphite with a check rather than green.

Tokens live in two mirrored places:

- `mobile/src/theme/tokens.js` — the React Native source of truth
- the `@theme` block in each web app's `src/index.css` — same ramp, exposed as
  Tailwind `brand-*` utilities

Full rationale and contrast measurements: `docs/superpowers/specs/2026-08-21-mydriver-mobile-design.md`.

## App tour

Use the **Customer / Driver** switch in each home screen's header.

**Customer mode**
1. Pick a drop point, skill certification (MD-Standard → MD-Night), speed ceiling slider and VisionCam mode.
2. Find a driver → live trip screen with animated map, speed-vs-ceiling telemetry and breach logging.
3. Share a guardian link (SMS/WhatsApp simulation) or hold the SOS button for the emergency drill.
4. Rate the driver; the trip is sealed into the Trip Vault with an exportable certificate.
5. Manage guardians (max 3) and safety toggles in Profile.

**Driver mode**
1. Dashboard with telematics score ring, earnings and an incoming request.
2. Accept → pickup handshake: face-match liveness scan + customer OTP gate (demo OTP `4821`).
3. 8-point car inspection with simulated camera capture, GPS/timestamp watermarking.
4. Active drive dashboard: g-force bars for harsh braking (>0.4g) and swerving (>0.35g) plus an event log.
5. End trip → payout summary and score impact.

## Notes

- `mock.js` still supplies presentation-only data in the connected apps — place
  names, marketing copy, skill descriptions. Prices come from the API
  (`GET /v1/rate-cards`), and all trip and account data is real.
- The mobile apps still simulate camera, GPS and accelerometer rather than using
  device APIs — but the simulated telemetry is streamed to the real backend over
  a real WebSocket, stored in TimescaleDB, and the completed trip's distance is
  computed from it. The native modules a production build would need
  (`react-native-vision-camera`, background geolocation, volume-button SOS
  listeners) are listed in `docs/mobile_app_spec.md` and remain out of scope.
- Store buttons, calls and exports are clearly-labelled demo actions.
- Auth is real: OTP over the API, JWTs with rotating refresh tokens, stored in
  `localStorage` on web and the device keychain (`expo-secure-store`) on mobile.
  For production the web app would additionally need CSP headers.

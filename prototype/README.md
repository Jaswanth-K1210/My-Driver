# MyDriver Prototype

Frontend-only prototypes for the MyDriver ecosystem. **No backend** — every screen runs on simulated mock data.

## What's inside

| Folder     | App                                                          | Run                |
| ---------- | ------------------------------------------------------------ | ------------------ |
| `website/` | Marketing website (skills, safety stack, pricing, FAQ)        | `npm run dev`      |
| `app/`     | Web app prototype — Customer & Driver modes in one shell      | `npm run dev`      |
| `mobile/`  | React Native (Expo) app — the same two flows, on device       | `npm start`        |

`website/` and `app/` are Vite + React 19 + Tailwind CSS 4. `mobile/` is Expo SDK 57 + React Native 0.86 with React Navigation.

## Quick start

```bash
cd prototype/website && npm install && npm run dev
cd prototype/app     && npm install && npm run dev
cd prototype/mobile  && npm install && npm start   # then scan the QR code with Expo Go
```

The mobile app runs in **Expo Go** — no Xcode or Android Studio build required.

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

- All data lives in `src/data/mock.js`; nothing is persisted or sent anywhere. `app/` and `mobile/` share the same file contents.
- The mobile app simulates camera, GPS and accelerometer rather than using device APIs. The native modules a production build would need (`react-native-vision-camera`, background geolocation, volume-button SOS listeners) are listed in `docs/mobile_app_spec.md` and are intentionally out of scope here.
- Store buttons, calls and exports are clearly-labelled demo actions.
- For production this frontend would be hardened with real CSP headers, auth and API integration — intentionally out of scope for the prototype.

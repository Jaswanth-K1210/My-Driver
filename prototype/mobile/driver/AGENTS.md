# AGENTS.md — Driver partner mobile app (`prototype/mobile/driver`)

**Owner: Umesh.** This file adds area-specific rules on top of the team rules in the root [`AGENTS.md`](../../../AGENTS.md). Read that one first; if the two ever conflict, the root file wins. Umesh may change this file; changes to the root file need all three developers to agree.

## Stack
- Expo **SDK 57**, React Native (New Architecture), JavaScript (no TypeScript).
- **Read the versioned Expo docs before using any Expo API:** https://docs.expo.dev/versions/v57.0.0/
- Source layout: `src/screens/driver/`, `src/context/` (`DriverContext.jsx`), `src/lib/` (`onboardingGate.js`, `tracking.js`, `telemetry.js`), `src/components/`, `src/navigation/`, `src/theme/`. Unit tests are in `tests/`.

## Checks before every commit
There is **no `lint` script** in this app. Run:
```bash
npm test                             # onboarding gate unit tests (node --test), must stay green
npx expo export --platform android   # bundles cleanly
npx expo export --platform ios       # once iOS work starts
```
Native features (maps, push, background location, the foreground service) **don't run in Expo Go**. They need a development build (`eas build --profile development`). Never remove or stub them out to make Expo Go work.

## Area rules
1. **`src/lib/api.js` is a copy of `prototype/shared/api-client.js`.** Never edit it. If you need a new API call or a payload change, add a `REQUEST` line for Jaswanth in `tasks.md`.
2. **Onboarding gate (`src/lib/onboardingGate.js`) is safety-critical.**
   - Never treat an offline or failed check as "approved".
   - A trip already past the handshake (`IN_TRIP` / `ESCALATED`) may carry on through a network failure.
   - Going online, offers and new trips always wait for a fresh server check.
   - **Any change here needs a matching unit test in `tests/`.**
3. **Offers:**
   - Offers arrive over WebSocket (`TRIP_OFFER`) **and** through `/v1/driver/offers` polling.
   - Both paths must produce the same offer card, so keep `toRequest()` in `DriverContext.jsx` the single adapter.
   - Never use a `{lat,lng}` object as display text. Fall back to readable labels.
4. **Location and telemetry:**
   - Don't weaken the background location / foreground service setup (`tracking.js`).
   - Don't weaken the offline queue rules in `telemetry.js`: thin the queue instead of dropping fixes, and block trip completion while fixes are still queued.
   - The server bills distance from this data.
5. **Money:**
   - The platform fee and other fees come from `/v1/catalogue/trip-config`. Never hardcode amounts.
   - Earnings shown are the server's figures.
6. **Inspection:** all 8 photos must upload before a trip can start or complete; keep the per-photo retry.
7. **Native folders:** `android/` and `ios/` are generated — never commit them. Config lives in `app.json` / `app.config.js` and `eas.json`.
8. **Secrets:**
   - `google-services.json`, `GoogleService-Info.plist` and `.env` stay out of git.
   - Only `EXPO_PUBLIC_*` variables reach the app.
9. **Phone checks:** app features are "Written — needs phone check" in `tasks.md` until they pass [`docs/driver-app-testing.md`](../../../docs/driver-app-testing.md) on a real Android phone **and** an iPhone, including the 2-hour battery and data test. Umesh also owns that testing doc; keep it in line with the code.

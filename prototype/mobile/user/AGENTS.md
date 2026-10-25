# AGENTS.md — Customer mobile app (`prototype/mobile/user`)

**Owner: Sanath.** This file adds area-specific rules on top of the team rules in the root [`AGENTS.md`](../../../AGENTS.md). Read that one first; if the two ever conflict, the root file wins. Sanath may change this file; changes to the root file need all three developers to agree.

## Stack
- Expo **SDK 57**, React Native (New Architecture), JavaScript (no TypeScript).
- **Read the versioned Expo docs before using any Expo API:** https://docs.expo.dev/versions/v57.0.0/
- Source layout: `src/screens/customer/` (screens and `components/`), `src/context/`, `src/lib/`, `src/components/`, `src/navigation/`, `src/theme/`.

## Checks before every commit
There is **no `lint` or `test` script** in this app. Run:
```bash
npx expo export --platform android   # bundles cleanly
npx expo export --platform ios       # once iOS work starts
```
Native features (maps, push, `expo-location`, volume-button SOS) **don't run in Expo Go**. They need a development build (`eas build --profile development`). Never remove or stub them out to make Expo Go work.

## Area rules
1. **`src/lib/api.js` is a copy of `prototype/shared/api-client.js`.** Never edit it. If you need a new API call or a payload change, add a `REQUEST` line for Jaswanth in `tasks.md`.
2. **The server is the source of truth for money and tier.**
   - Show prices from the server quote only; never compute the fare in the app.
   - The server picks the driver tier from the customer's car. Don't bring back a tier picker.
   - Fees (platform, night, stop, arrival-cancellation) come from `catalogue.tripConfig()` / the quote. Never hardcode amounts.
3. **Booking payloads** (`src/lib/booking.js`):
   - Every stop and return stop must carry `{ address, lat, lng }` (the server bills stops from the coordinates).
   - `HOURLY` only for genuine hourly hire, never because a trip is long.
   - Outstation round trips send `return_drop`.
4. **Trip states:** handle every server state, including `DRIVER_ARRIVED`, `ESCALATED`, `NO_DRIVERS_FOUND` and `CANCELLED`. Never leave the user on a dead screen.
5. **Errors never block booking.** Side calls (saving safety defaults, `refreshMe()`, profile updates) go in their own `try/catch` and show a message.
6. **Native folders:** `android/` and `ios/` are generated — never commit them. App config lives in `app.json` / `app.config.js` and `eas.json`.
7. **Secrets:**
   - `google-services.json`, `GoogleService-Info.plist` and `.env` stay out of git.
   - Only `EXPO_PUBLIC_*` variables reach the app, so never put a server secret in one.
8. **Accessibility:** every touchable has `accessibilityLabel` / `accessibilityRole`. Keep the red + neutral palette from `src/theme/`.
9. **Phone checks:** app features are "Written — needs phone check" in `tasks.md` until they pass [`docs/user-app-testing.md`](../../../docs/user-app-testing.md) on a real Android phone **and** an iPhone. Sanath also owns that testing doc; keep it in line with the code.

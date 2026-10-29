# Progress: Umesh (driver app, and the user app from 2026-10-11)

Latest session first. `tasks.md` holds the task list; this file records what
was actually done and what state it is in.

## 2026-10-30 · Jaswanth · Testing layer 1 (CI)

**Did:** Added a `mobile` job to `.github/workflows/ci.yml` (matrix: user, driver): `npm ci`, the
driver app's `npm test`, and `npx expo export --platform android` for both apps. CI only ran on
pushes to `main` and `validation`, so nothing pushed to `production-p1` was checked; added
`production-p1` to the push trigger. Updated `docs/testing-plan.md` §4.
**Checks:** Driver app after a clean `npm ci`: `npm test` 26/26 · `npx expo export --platform android`
pass. User app export pass. Workflow YAML parses. The job itself runs on GitHub after this push.
**Note for Umesh:** the driver app's local `node_modules` was missing `expo-notifications`, so the
export failed until `npm ci`. If your export fails on a plugin, run `npm ci`.
**Commit:** `chore(ci): testing layer 1, mobile checks in CI`
**Requests raised:** none.

## 2026-10-30 · Jaswanth · Testing tasks added

**Did:** Added the testing plan's work to `tasks.md`. In Jaswanth's Phase 4–6 list: layer 1 (CI runs
the driver app's tests and the user app's bundle check), layer 2 (Playwright for website and console),
searchable logs on staging, Sentry in the backend and website.
**Requests raised:** Maestro end-to-end flows (testing layer 3) as REQUEST lines in **Sanath's** and
**Umesh's** sections, per `docs/testing-plan.md` §6. Only they edit their app folders.
**Commit:** `docs: testing tasks and Maestro requests in tasks.md`

## 2026-10-30 · Sanath · CR-10

**Did:** In `docs/user-app-testing.md`, updated the two sections that contradicted the customer mobile app implementation:
- §6 Amount due after a trip: documented that `VaultScreen.jsx` displays a "Pay ₹N" button initiating hosted checkout via the in-app browser for outstanding balances and reloads the receipt upon return (replacing the outdated note stating there was no Pay button yet).
- Concluding note / Needs from Jaswanth: documented that the customer app follows the website with the manual tier picker removed, and Step 4 automatically displaying the server-assigned tier from `car_details` without sending `tier` in the booking payload (replacing the statement claiming the app still showed a tier picker and that alignment was an open question).
**Checks:** `npx expo export --platform android` passed with 0 errors (bundled 2907 modules).
**Commit:** `docs(CR-10): update user app testing guide to match implemented amount-due payment and server tier selection`
**Not done / follow-ups:** Needs phone check in Phase 5.
**Requests raised:** none.

## 2026-10-30 · Sanath · CR-8

**Did:** In `prototype/mobile/user/src/lib/tripView.js`, updated `specPlate` in `toViewTrip` so that it returns strictly the trimmed plate string if present, or `null`. Stopped falling back to `[specs.transmission, specs.engineType]`, which previously caused transmission and fuel types (e.g. "Manual · Petrol") to be displayed in the vehicle license plate field when `specs.plate` was not provided.
**Checks:** `npx expo export --platform android` passed with 0 errors (bundled 2907 modules).
**Commit:** `fix(CR-8): do not show transmission and fuel as license plate`
**Not done / follow-ups:** Needs phone check in Phase 5.
**Requests raised:** none.

## 2026-10-30 · Sanath · CR-7

**Did:** In `HomeScreen.jsx` `findDriver()`, wrapped `api.me.update` (saving first-time safety defaults) and `await refreshMe()` in separate, independent `try/catch` blocks. If saving safety defaults fails, the failure is caught without blocking `refreshMe()` or `onFindDriver(config)`. `await refreshMe()` is awaited in its own try/catch block with `finally { setSaving(false) }`, preventing unhandled promise rejections and ensuring saving state is always cleaned up and booking proceeds unconditionally.
**Checks:** `npx expo export --platform android` passed with 0 errors (bundled 2907 modules).
**Commit:** `fix(CR-7): isolate safety defaults update and refreshMe in separate try-catch blocks`
**Not done / follow-ups:** Needs phone check in Phase 5.
**Requests raised:** none.

## 2026-10-30 · Sanath · CR-1 (Option C refinement)

**Did:** Option C return drop refinement in customer app. In `prototype/mobile/user/src/lib/booking.js`, updated `resolveReturnDrop()` so cleared, missing, or invalid location IDs on two-way round trips resolve to `null` instead of silently falling back, while keeping `'same_as_pickup'` or matching pickup ID falling back to pickup coordinates. In `HomeScreen.jsx` `findDriver()`, added two-way round trip validation: if the resolved `return_drop` is null or missing, booking is blocked and an alert prompts the user to select a valid final return destination.
**Checks:** `npx expo export --platform android` pass (0 errors).
**Commit:** `fix(CR-1): require return drop selection when cleared on round trips`
**Not done / follow-ups:** Needs phone check in Phase 5.
**Requests raised:** none.

## 2026-10-30 · Jaswanth · Testing plan

**Did:** New `docs/testing-plan.md`: the order agreed today (Sanath's CR-7, CR-8, CR-10 first, then
testing layers 1 to 3, then Sentry); which build to test on (development builds in Phase 4, preview
builds for Phase 5 results, never Expo Go); where the backend runs (laptop on the same Wi-Fi at a
desk, staging for road tests, a Cloudflare tunnel as a stopgap); the four test layers with owners
(automated checks, Playwright for website and console, Maestro for both apps, the manual suites as
joint rides); the iPhone path through X-1 and TestFlight; what the backend already logs and what to
add (Loki on staging, Sentry with privacy scrubbing); and the daily Phase 5 routine.
**Checks:** docs only.
**Commit:** `docs: testing plan for Phases 4 and 5`
**Not done / follow-ups:** CI does not run the driver app's `npm test` or the user app's bundle check
yet (section 4). Maestro flows are proposed for Sanath and Umesh, not assigned in `tasks.md`.
**Requests raised:** none.

## 2026-10-29 · Sanath · Phase 3 code tasks complete

**Session accomplishments (all 6 Phase 3 code tasks complete):**
- **M-8 completed:** Purged stale native `android/` and `proto/` from git tracking, added `android/` and `ios/` to `.gitignore` to unblock EAS builds (`chore(M-8)`).
- **CR-1 + M-2 completed:** Resolved stop coordinates `{lat, lng, address}`, removed `durationHours > 8` conversion to `HOURLY` for within-city trips, added `return_drop` for outstation round trips, verified against backend Zod schema (`fix(CR-1)`).
- **Option C refinement completed:** Validated return drop selection on round trips to prevent unprompted fallbacks when cleared (`fix(CR-1)`).
- **M-5 completed:** Added "Stops" fee line to quote breakdown in `HomeScreen.jsx` and deducted `stops_fee` from base tier line, matching website `Book.jsx` (`fix(M-5)`).
- **CR-7 completed:** Isolated first-time safety defaults persistence and `refreshMe()` in separate, independent try/catch blocks in `HomeScreen.jsx` (`fix(CR-7)`).
- **CR-8 completed:** Stopped showing transmission and fuel types as license plate in `tripView.js` (`fix(CR-8)`).
- **CR-10 completed:** Updated `docs/user-app-testing.md` to reflect `VaultScreen.jsx` amount-due Pay button and server-selected driver tier (`docs(CR-10)`).
- **Checks:** All tasks verified with `npx expo export --platform android` exiting 0 with zero errors and pushed to `production-p1`.

**State:**
- All six Phase 3 customer mobile app code tasks for Sanath are fully implemented, verified with Expo export (0 errors), and pushed to `production-p1`.
- Sanath's Phase 3 code items are complete.

**Open non-code tracking reminders:**
- **X-1:** Apple Developer Program (organisation) & App Store Connect (Sanath).
- **X-2:** Expo/EAS organisation for user app (Sanath).
- **X-3:** Firebase project registration for user apps (Sanath, awaiting Jaswanth).
- **D-2:** TestFlight distribution decision (Sanath + Umesh, awaiting X-1).
- **Shared bug log setup:** Setup per `prd.md` §3.5 (Sanath).

## 2026-10-30 · Jaswanth · Phase 4 check run (early prep)

**Did:** Ran Jaswanth's Phase 4 checks on `c44e3f5` (all of today's fixes). Code unchanged.
**Checks:** backend `npm run db:migrate` pass · `npm run typecheck` pass · `npm test` **36 files,
411/411 pass** on the Docker Postgres/Redis · website `npm run lint` 0 errors, 22 warnings ·
`npm run build` pass · `npm run build:admin` pass · `npm run check` pass.
**Commit:** `docs: Phase 4 backend and website checks pass on c44e3f5`
**Not done / follow-ups:** Re-run after any later backend or website change. Still open for
Jaswanth, all needing accounts or the staging server: X-3, X-4, X-5, X-6, staging up, D-4 prices,
amount due against Razorpay test mode.
**Requests raised:** none.

## 2026-10-30 · Jaswanth · Staging prep (early prep for X-5)

**Did:** `deploy/README.md` now has a **Staging** section: which variables differ from production
(staging subdomains, Razorpay test mode, Cashfree sandbox, APNs sandbox and the `.dev` /
`.preview` bundle IDs, the Hyderabad search bias), the steps after the first deploy (staff
accounts, Hyderabad prices in Pricing for D-4), and exactly what to hand Sanath and Umesh for X-3
and X-4 (`EXPO_PUBLIC_API_URL`, the Firebase files as EAS secrets, restricted Maps keys). The
accounts table also lists the APNs key.
**Checks:** docs only; values checked against `env.ts`, the Caddyfile and both apps'
`app.config.js` / `src/lib/config.js`.
**Commit:** `docs: staging runbook and app-key handover in deploy/README.md`
**Not done / follow-ups:** The staging server itself (X-5), the Firebase project (X-3), the Maps
keys (X-4) and Razorpay/Cashfree activation (X-6) need Jaswanth's accounts. Nothing else in
Jaswanth's Phase 3 list is left.
**Requests raised:** none.

## 2026-10-30 · Jaswanth · D-4 (early prep: place-search bias)

**Did:** The code part of D-4. Neither app sends its position with a place search (the user
app's `ModalPicker` calls `search(query)` alone, and nothing sets the website `PlacePicker`'s
`near`), so searches had no Hyderabad bias at all. `searchLocations()`
(`prototype/backend/src/modules/locations/service.ts`) now falls back to the new
`PLACE_SEARCH_BIAS` (default `17.3850,78.4867`, central Hyderabad; empty turns it off) when the
caller sends no `lat`/`lng`. It is a bias, not a restriction: Google still returns other
cities. Added to `.env.example` and `deploy/.env.production.example`.
**Checks:** `npm run typecheck` pass · `npm test` 36 files, 411/411 pass (Docker). New test in
`tests/integration/app-upgrade.test.ts` checks which point reaches the maps provider.
**Commit:** `feat(D-4): place search leans towards Hyderabad when the app sends no position`
**Payload changed:** none.
**Not done / follow-ups:** The rest of D-4 needs the staging server: enter the Hyderabad rate
cards and fees in the console's Pricing page. **Question for the team:** `prd.md` D-4 mentions a
"service area / dispatch centre", but the code has no service-area check (bookings anywhere are
accepted; dispatch looks 5 km around the pickup). Adding a restriction would be new scope, so it is
not done; decide whether it is wanted for the handover.
**Requests raised:** none.

## 2026-10-30 · Jaswanth · CR-9 / CR-11

**Did:** `api-documentation.md` is current. The generated endpoint reference was already
regenerated in `fix(M-1)` and is unchanged by `npm run docs:api` now (113 endpoints). The
hand-written sections were behind the code and are updated:
- **Payments flow:** paying `amount_due` on the same checkout page (second order), and who pays
  the arrival cancellation fee (only a customer cancelling after arrival).
- **Realtime:** added `SUBSCRIBE_OPS` / `UNSUBSCRIBE_OPS`, `DRIVER_ARRIVED`, `OPS_SUBSCRIBED` /
  `OPS_UNSUBSCRIBED`, `OPS_CHANGED`, `DRIVERS_LIVE`; `TRIP_STATE_CHANGED` is sent for console
  actions too; `TRIP_OFFER` points to `GET /v1/driver/offers` for the full card.
- **New "Push notifications" section:** device registration, FCM vs APNs, when tokens are
  deleted, the `data.type` values.
Also corrected the `ANOMALY_TRIGGERED` comment in `src/realtime/protocol.ts` (it said "Reserved for
Phase 2"; it is sent today). Comment only.
**Checks:** `npm run docs:api` keeps the edits · `npm run typecheck` pass · `tests/unit/protocol.test.ts`
7/7 pass.
**Commit:** `docs(CR-9): bring api-documentation.md up to date with payments, realtime and push`
**Requests raised:** none.

## 2026-10-30 · Jaswanth · M-7

**Did:** On the console's live Board (`prototype/website/src/pages/admin/Board.jsx`), each row in
"Active trips" opens that trip's page (`/trips/:id`), the same as the Trips list. Rows also open
with Enter or Space, so the table works from the keyboard.
**Checks:** `npm run lint` 0 errors, 22 warnings (none new) · `npm run build` pass ·
`npm run build:admin` pass · `npm run check` pass.
**Commit:** `fix(M-7): open a trip from the console Board's active-trip rows`
**Requests raised:** none.

## 2026-10-30 · Jaswanth · CR-8 (website)

**Did:** `prototype/website/src/lib/tripView.js` uses only the car's real `plate` for the trip
card. With no plate it used to fall back to transmission and fuel ("Manual · Diesel") and show that
as the number plate; now the plate is left empty. The driver's own `vehicle_plate` still wins.
**Checks:** `npm run lint` 0 errors, 22 warnings (none new) · `npm run build` pass ·
`npm run build:admin` pass · `npm run check` pass.
**Commit:** `fix(CR-8): never show transmission or fuel as the plate on the website`
**Requests raised:** none (Sanath's app has its own CR-8 item).

## 2026-10-30 · Jaswanth · CR-7 (website)

**Did:** On the website's Book page (`prototype/website/src/pages/dashboard/Book.jsx`), saving the
safety defaults ("Save as my defaults") now runs in its own try/catch. If it fails the customer
sees a warning and the trip is still booked; before, the error stopped the booking. A failed
`refreshMe()` is ignored too.
**Checks:** `npm run lint` 0 errors, 22 warnings (none new) · `npm run build` pass ·
`npm run build:admin` pass · `npm run check` pass.
**Commit:** `fix(CR-7): a failed safety-defaults save never blocks a website booking`
**Requests raised:** none (Sanath's app has its own CR-7 item).

## 2026-10-30 · Jaswanth · CR-6

**Did:** The console's Pricing page (`prototype/website/src/pages/admin/Pricing.jsx`) blocks empty,
negative and out-of-range prices and fees before they reach the server. An emptied box used to be
sent as `0` (`Number('')`), and a typed minus sign got past `min="0"`. The page now checks each
value against the server's own bounds (rates: per km 1–500, hourly 10–10,000, included km 0–100
whole; fees 0–1,000 or 0–2,000), highlights a bad box, says what range to enter, and disables Save
until it is fixed.
**Checks:** `npm run lint` 0 errors, 22 warnings (none new) · `npm run build` pass ·
`npm run build:admin` pass · `npm run check` pass. Not clicked through in a browser.
**Commit:** `fix(CR-6): block empty or out-of-range prices and fees in the console`
**Requests raised:** none.

## 2026-10-30 · Jaswanth · CR-5

**Did:** The console's trip page (`prototype/website/src/pages/admin/TripDetail.jsx`) no longer
crashes on a `FARE_DISTANCE_REVIEW` flag with no `details`, and shows "—" instead of "NaN km"
when a distance is missing (new `km()` helper; `a.details?.tracked_km` / `billed_km`).
**Checks:** `npm run lint` 0 errors, 22 warnings (none new) · `npm run build` pass ·
`npm run build:admin` pass · `npm run check` pass.
**Commit:** `fix(CR-5): guard missing distances on the console's fare-review flag`
**Requests raised:** none.

## 2026-10-30 · Jaswanth · M-6 + D-1

**Did:** Push no longer cuts iPhones off, and iPhones can now be reached.
- **M-6:** `fcm.ts` deletes a device token only when FCM says the app is gone (`404` /
  `errorCode: UNREGISTERED`, new `isDeadFcmToken()`). A plain `400 INVALID_ARGUMENT` no longer
  deletes anything; that is what deleted every iOS token on its first send.
- **D-1 (backend side):** new `src/providers/push/apns.ts`. Tokens registered with
  `platform: 'ios'` go straight to Apple over HTTP/2 with token auth (ES256 JWT from a `.p8`
  key, cached 50 min); Android stays on FCM. No new dependency (`node:http2`, `node:crypto`).
  `APNS_TOPICS` (bundle IDs) are tried in order, since `device_tokens` does not record which app
  a token belongs to: `DeviceTokenNotForTopic` moves on to the next. `410 Unregistered` deletes
  the token; `BadDeviceToken` (usually sandbox vs production) keeps it and logs. An unreachable
  Apple never stops that user's Android pushes.
- No APNs key configured: iOS tokens are kept and skipped, never sent to FCM.
- New env: `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPICS`, `APNS_PRODUCTION`
  (in `.env.example` and `deploy/.env.production.example`). Production start-up warns when
  APNs is unset or still on the sandbox.

**Checks:** `npm run typecheck` pass · `npm test` 36 files, 410/410 pass (Docker). New
`tests/integration/push-providers.test.ts` (5 tests: a local HTTP/2 server stands in for Apple
and verifies the ES256 signature and topic; FCM stubbed) and a config-warning unit test.
**Not tested against the real Apple or Firebase services:** needs the APNs `.p8` key (X-1,
Sanath's Apple account) and the Firebase project (X-3). Development builds need
`APNS_PRODUCTION=false` and the `.dev` bundle IDs in `APNS_TOPICS`; TestFlight needs `true`.
**Commit:** `fix(M-6): keep iOS device tokens and send iOS push through APNs (D-1)`
**Payload changed:** none. The apps keep registering the raw device token with `platform`.
**Not done / follow-ups:** the "Everyone" D-1 decision line is left for a human to tick.
**Requests raised:** none.

## 2026-10-29 · Sanath · M-5

**Did:** Displayed "Stops" fee line in `prototype/mobile/user/src/screens/customer/HomeScreen.jsx` quote breakdown when `server.fare.stops_fee > 0`, and subtracted `stops_fee` from the base tier fare line (`server.fare.base - (server.fare.stops_fee ?? 0)`) so the sum of individual rows equals total, matching `prototype/website/src/pages/dashboard/Book.jsx`.
**Checks:** `npx expo export --platform android` pass (bundled cleanly with 0 errors).
**Commit:** `fix(M-5): display stops fee item in home screen quote breakdown`
**Not done / follow-ups:** Needs phone check in Phase 5. Next task is CR-7 (safety defaults persistence and refreshMe in try/catch).
**Requests raised:** none.

## 2026-10-30 · Jaswanth · M-3

**Did:** The website now shows "₹X still to pay" with a **Pay ₹X** button when a finished trip has
`amount_due > 0`, on the trip-complete screen (`pages/dashboard/Track.jsx`) and in the Trip
Vault detail (`pages/dashboard/Vault.jsx`). New `components/app/PayDue.jsx` loads
`api.payments.forTrip()`, opens the same hosted checkout page in a new tab straight from the
click (so it is not popup-blocked), and polls every 3 s until the balance is paid, then hides
itself. Matches the user app's `TripCompleteScreen` / `VaultScreen`.
**Checks:** `npm run lint` 0 errors, 22 warnings (none new) · `npm run build` pass ·
`npm run build:admin` pass · `npm run check` pass. **Not clicked through in a browser**: needs a
trip with an amount due (Phase 4 "amount due against Razorpay test mode").
**Commit:** `fix(M-3): pay the balance due from the website's trip screens`
**Payload changed:** none. `api.js` not changed.
**Requests raised:** none.

## 2026-10-30 · Jaswanth · Website booking check

**Did:** `prototype/website/scripts/check-booking.mjs` now expects a 10-hour Within-City trip to
be sent as `POINT_TO_POINT` with `hours: 10`, as the booking code has done since `bd0d854`. The
script was stale (see the CR-3 entry); the booking code is unchanged.
**Checks:** `npm run check` pass.
**Commit:** `chore: website booking check expects long Within-City trips as POINT_TO_POINT`

## 2026-10-29 · Sanath · CR-1 + M-2

**Did:** Fixed booking payload construction in `prototype/mobile/user/src/lib/booking.js`:
- Added `resolveStopList` helper to resolve every stop and return stop to `{ id, locationId, name, address, lat, lng }` via `getLocationById()`.
- Added `resolveReturnDrop` helper to resolve return drops for round trips to `{ lat, lng, address }`, falling back to pickup coordinates.
- Stopped converting Within-City trips over 8 hours to `HOURLY`; only `config.requirement === 'full_time'` switches to `HOURLY`, preserving `drop`, `drop_address`, and durations up to 12h for point-to-point routes.
- Sent `return_drop` for outstation round trips (`inter_city` with `tripType === 'two_way'`) using `config.interCityDetails?.returnDropId || config.returnDropId`.
- Handled airport two-way `return_drop` set to `{ lat: pickup.lat, lng: pickup.lng }`.
**Checks:** Zod schema validation pass (`QuoteBody` and `BookTripBody`) · `npx expo export --platform android` pass (bundled cleanly with 0 errors).
**Commit:** `fix(CR-1): resolve stop coordinates, outstation return drop, and preserve point-to-point duration`
**Not done / follow-ups:** Needs phone check in Phase 5. Next task is M-5 (Stops fee in quote breakdown).
**Requests raised:** none.

## 2026-10-30 · Jaswanth · CR-3

**Did:** "Use current location" on the website (`prototype/website/src/components/app/PlacePicker.jsx`)
names the customer's GPS position through `api.locations.reverse()` (the backend's cached
locations proxy) instead of the browser calling public Nominatim. Signed out, or if the lookup
fails, the label is the coordinates and nothing leaves for a third party. No other browser
geocoder call is left in `website/src` (the map picker already used the backend).
**Checks:** `npm run lint` 0 errors, 22 warnings (same as before, none new) · `npm run build` pass ·
`npm run build:admin` pass · `npm run check` **fails, and failed before this change too**: it
asserts a 10-hour Within-City trip is sent as `HOURLY`, but `bd0d854` (18 Oct) deliberately
stopped that conversion (the same rule as Sanath's M-2). The script is stale, not the booking
code; to be fixed in its own commit.
**Commit:** `fix(CR-3): reverse geocode through the backend, not public Nominatim`
**Payload changed:** none. `api.js` not changed.
**Not done / follow-ups:** Update `scripts/check-booking.mjs` to expect `POINT_TO_POINT` with
`hours: 10`.
**Requests raised:** none.
**Requests raised:** none.

## 2026-10-29 · Sanath · M-8

**Did:** Removed stale `prototype/mobile/user/android` (generated for legacy SDK 54, which prevented EAS builds from respecting `app.json` plugins/permissions) and unused `prototype/mobile/proto` from git tracking via `git rm -r`. Added `android/` and `ios/` to `prototype/mobile/user/.gitignore` so generated native directories remain ignored.
**Checks:** `npx expo export --platform android` pass (bundled cleanly with 0 errors).
**Commit:** `chore(M-8): remove stale native android and proto directories; ignore generated native folders`
**Not done / follow-ups:** Unblocks EAS builds for customer app. Next task is CR-1 + M-2 in `src/lib/booking.js`.
**Requests raised:** none.

## 2026-10-30 · Jaswanth · D-3 (Umesh's request)

**Did:** Backend side of D-3: a driver's own vehicle and plate are optional.
- `profile_complete` now checks only `full_name`, in both `GET /v1/driver/profile`
  (`driver-app/service.ts`) and `GET /v1/driver/summary` (`trips/service.ts`).
- `PATCH /v1/driver/profile` accepts `""` or `null` for `vehicle_model` / `vehicle_plate` and
  clears the field. A non-empty value is still checked (plate 2–32 chars, model 1–120).

Nothing server-side ever blocked going online on `profile_complete`, so dispatch is unchanged.
New test in `tests/integration/driver-app.test.ts`; fails without the fix.
**Checks:** `npm run typecheck` pass · `npm test` 35 files, 404/404 pass (Docker).
**Commit:** `feat(D-3): vehicle and plate optional on the driver profile`
**Payload changed:** `PATCH /v1/driver/profile` body: `vehicle_model` / `vehicle_plate` may now be
`""` or `null` (additive). `profile_complete` is `true` for any driver with a name.
`api-documentation.md` regenerated.
**Not done / follow-ups:** Umesh's driver app can now send blank fields to clear them. The
"Everyone" D-3 line is left for a human to tick.
**Requests raised:** none.

## 2026-10-29 · Jaswanth · CR-2

**Did:** Un-approving or suspending a driver from the console no longer leaves their trips
hanging. New `withdrawUnapprovedDriver()` in `prototype/backend/src/modules/trips/matching.ts`,
called from `setOnboardingStatus()` (`admin-ops/service.ts`) after the driver leaves the geo index:
- `HANDSHAKE_PENDING` (accepted, not started): cancelled with **no fee** even if the driver had
  arrived; `cancelled_by` is the ops user; hold released; guardian links revoked;
  `TRIP_STATE_CHANGED → CANCELLED` broadcast (the customer gets the "Trip cancelled" push).
- `MATCHED` (only offered): the offer expires and the trip goes back to `REQUESTED` and is
  re-dispatched to the next driver, like a decline. **This differs from the CR-2 wording**
  ("cancel"); Jaswanth chose re-dispatch so the customer's booking carries on. Before this fix the
  offer was expired but the trip stayed `MATCHED` forever (the sweeper only looks at `PENDING`
  offers).
- `IN_TRIP` / `ESCALATED`: unchanged (L2 escalation, finish safely).

Two new tests in `tests/integration/onboarding-gate.test.ts`; both fail without the fix.
**Checks:** `npm run typecheck` pass · `npm test` 35 files, 403/403 pass (Docker).
**Commit:** `fix(CR-2): withdraw an unapproved driver from trips that have not started`
**Payload changed:** none (existing `TRIP_STATE_CHANGED` frames). No route changed.
**Suggestion for `prd.md` §3A:** reword CR-2 to "cancel `HANDSHAKE_PENDING`, re-dispatch
`MATCHED`" (humans only).
**Requests raised:** none.

## 2026-10-29 · Umesh · M-4 follow-up

**Did:** `DriverContext.jsx` re-reads the trip on an `ANOMALY_TRIGGERED` frame for the current
trip, as it already did on `TRIP_STATE_CHANGED`. Jaswanth's M-4 note: L3+ sets the trip to
`ESCALATED` but announces only `ANOMALY_TRIGGERED`, so the drive screen's escalation banner
waited for the next refresh. Logged under my Phase 3 list as "M-4 follow-up" (M-4 itself is
Jaswanth's item).
**Checks:** `npm test` 26/26 · `npx expo export --platform android` pass.
**Commit:** `fix(M-4): show the escalation banner as soon as an anomaly is announced`
**Not done / follow-ups:** Needs phone check (`docs/driver-app-testing.md` §17).
**Requests raised:** none.

## 2026-10-29 · Umesh · D-3

**Decision (Umesh, 29 Oct):** drivers drive the customer's car, so their own vehicle model and
plate are **optional**; only the name is required before going online. `prd.md` D-3 and the
"Everyone" D-3 line in `tasks.md` are left for a human to update.
**Did:** `isDriverProfileComplete()` in `src/lib/utils.js` (4 unit tests) now decides profile
setup, going online and accepting offers from the name alone, in `DriverContext.jsx` and
`ProfileScreen.jsx`. It ignores the server's `profile_complete`, which still counts the vehicle
fields; the server never blocked going online on it, so this works before the backend change.
The profile form marks vehicle model and plate "(OPTIONAL)", and leaves them out of the save when
blank because the server's `min(2)` rejects an empty string. Messages on Home and in the setup
screen no longer ask for vehicle details.
**Checks:** `npm test` 26/26 · `npx expo export --platform android` pass.
**Commit:** `feat(D-3): drivers' own vehicle and plate are optional; only the name is required`
**Not done / follow-ups:** Needs phone check (`docs/driver-app-testing.md` §14 step 1). A driver
cannot clear a vehicle field they saved earlier until the backend accepts an empty value.
**Requests raised:** Jaswanth: `profile_complete` on name only, and allow clearing the vehicle
fields (`tasks.md`, his Phase 3 list).

## 2026-10-29 · Jaswanth · M-4

**Did:** `resolveEscalation()` (`prototype/backend/src/modules/escalation/service.ts`) now
publishes `TRIP_STATE_CHANGED → IN_TRIP` on the trip channel after commit, but only when the
trip actually moved from `ESCALATED` back to `IN_TRIP` (an incident resolved after the trip
ended sends nothing). It publishes the frame directly instead of calling
`broadcastStateChange()`, which would also push "Trip started" to the customer. New test in
`tests/integration/escalation.test.ts` spies on the hub; confirmed it fails without the fix.
**Checks:** `npm run typecheck` pass · `npm test` 35 files, 401/401 pass (Docker).
**Commit:** `fix(M-4): tell the apps the trip is back to IN_TRIP when an incident is resolved`
**Payload changed:** none: the existing `TRIP_STATE_CHANGED` frame, now also sent on resolve.
No route changed, so `api-documentation.md` is unchanged.
**Not done / follow-ups:** Unblocks Sanath's and Umesh's SOS tests. Noticed, not changed: raising
or promoting to L3+ sets the trip to `ESCALATED` but announces it only as `ANOMALY_TRIGGERED`, not
`TRIP_STATE_CHANGED → ESCALATED`. Fine if both apps treat `ANOMALY_TRIGGERED` as escalated;
worth checking during the Phase 4 joint test.
**Requests raised:** none.

## 2026-10-29 · Umesh · Test-runner warning

**Did:** `npm test` passes `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` to Node. Adding
`"type": "module"` to `package.json` (Node's own suggestion) was rejected: `app.config.js` is
CommonJS (`module.exports`) and Expo would then load it as an ES module and fail. Needs Node
20.11+; this laptop and CI use Node 22.
**Checks:** `npm test` 22/22 with no warning · `npx expo export --platform android` pass.
**Commit:** `chore(test-warning): silence MODULE_TYPELESS_PACKAGE_JSON in the driver unit tests`
**Not done / follow-ups:** none.
**Requests raised:** none.

## 2026-10-29 · Umesh · M-1 follow-up

**Did:** Both offer paths already produce the card through `toOffer()`: a WebSocket
`TRIP_OFFER` frame only triggers `refreshOffers()`, which reads `GET /v1/driver/offers`, so
Jaswanth's `de8adf1` fields reach the card either way. Fixed what the card did with them: the
car tag read "undefined Toyota Innova" when the car had no `company`, the round-trip and airport
tags only matched lower-case `two_way` / `airport` (the backend test books `ROUND_TRIP` /
`AIRPORT`), and only the first underscore of the requirement was replaced. The tags now come from
`offerTags()` in `src/lib/utils.js` (3 unit tests). `toRequest()` keeps `stops`, `returnStops`,
`vehicleSpecs`, `visionMode` and `flightNumber`, and accepting an offer keeps the offer's values
when the accept response lacks them.
**Checks:** `npm test` 22/22 · `npx expo export --platform android` pass.
**Commit:** `fix(M-1): offer card tags from the polled offer fields; keep them on the trip`
**Not done / follow-ups:** Needs phone check in Phase 5 (`docs/driver-app-testing.md` §16). The
card does not show `vision_mode` or the return stops; no task asks for it.
**Requests raised:** none.

## 2026-10-29 · Umesh · Onboarding auto-refresh

**Did:** While the driver is `UNDER_REVIEW`, `OnboardingScreen.jsx` checks
`/v1/driver/onboarding` every 10 s (only while the app is in the foreground, one request at a
time). It calls the gate's full `reload()` only when the payload differs from the one on screen,
because `validate()` swaps the screen for a loading state and a blind 10 s reload would flash it.
The comparison is `hasOnboardingChanged()` in `src/lib/onboardingGate.js`: key-order-independent,
and a malformed payload never counts as a change, so the poll can never grant approval itself.
Errors are ignored (the driver stays on the onboarding screen). 3 new unit tests.
**Checks:** `npm test` 19/19 · `npx expo export --platform android` pass.
**Commit:** `feat(onboarding-refresh): poll the review status every 10 s while UNDER_REVIEW`
**Not done / follow-ups:** Needs phone check in Phase 5 (`docs/driver-app-testing.md` §14 step 9).

## 2026-10-29 · Jaswanth · M-1

**Did:** `GET /v1/driver/offers` now returns `stops`, `return_stops`, `vehicle_specs`,
`vision_mode`, `flight_number`, `requirement` and `trip_type`. `listPendingOffers()` already
selected them; the route's Zod response schema stripped them
(`prototype/backend/src/modules/trips/routes.ts`). New integration test in
`tests/integration/trips-lifecycle.test.ts` books a trip with all seven fields and checks the
polled offer; confirmed it fails without the fix.
**Checks:** `npm run typecheck` pass · `npm test` 35 files, 400/400 pass (Docker Postgres on
5433, migrations applied).
**Commit:** `fix(M-1): return stops, car and trip type on GET /v1/driver/offers`
**Payload changed:** `GET /v1/driver/offers` items gain seven optional, nullable fields (additive;
nothing removed). The WebSocket `TRIP_OFFER` frame is unchanged (still `pickup` +
`fare_estimate` only), so the driver app should keep fetching the offer list for the card.
`api-documentation.md` regenerated; it also picked up routes from earlier commits that were
missing (`admin/pricing`, `locations/reverse`, safety fields). CR-9 / CR-11 left unticked until
checked against their findings.
**Not done / follow-ups:** Unblocks Umesh's **M-1 follow-up**.
**Requests raised:** none.

## 2026-10-29 · Umesh · CR-4

**Did:** `toRequest()` and `toOffer()` in `src/context/DriverContext.jsx` now take pickup/drop
text only from strings, through new `placeText()` / `placeCoords()` helpers in `src/lib/utils.js`.
A trip with no address now shows "Pickup point on map" / "Destination on map" instead of
rendering the server's `{lat,lng}` object (which crashed the trip screens), and the map
coordinates only ever hold a real `{lat,lng}`. Five unit tests in `tests/utils.test.mjs`, added
to `npm test`. Phone steps in `docs/driver-app-testing.md` §15.
**Checks:** `npm test` 16/16 (11 gate + 5 new) · `npx expo export --platform android` pass.
**Commit:** `fix(CR-4): never render {lat,lng} as pickup/drop text`
**Not done / follow-ups:** Needs phone check in Phase 5. M-1 follow-up still waits on Jaswanth's
`fix(M-1)`.
**Requests raised:** none.

## 2026-10-25: review of `31c72a0`, `bc34996`, `de02abc`; full code review; SDLC plan

Sanath's session. Only docs changed: `prd.md`, `tasks.md` and this file. No source code was touched.

**The 24 Oct findings are mostly closed.** Of the 7 findings in the entry below, 6
were fixed the same day by Jaswanth:
- `bc34996`: platform fee read from trip-config (finding 3).
- `de02abc`: tier picker removed; safety-defaults settings; `DRIVER_ARRIVED` banner;
  "Pay ₹X" on the receipt; "Verified" placeholders removed; Redis hint before the
  approval query in `listPendingOffers()`.
- `31c72a0`: approval decisions pushed to the driver app over WebSocket.

Still open: whether drivers must enter their own vehicle and plate. This is now
decision D-3 in `prd.md`.

**New code review (CodeRabbit CLI on `d640d2d..de02abc` + a manual cross-surface
audit): 19 findings** — 8 major, 11 moderate/minor.

| Owner | Findings | Majors |
|---|---|---|
| Jaswanth | 12 | M-1, M-3, M-4, CR-2, CR-3 |
| Sanath | 6 | CR-1, M-2 |
| Umesh | CR-4 + 3 polish items | CR-4 (crash during live trips) |

The three owners' file paths don't overlap, so all three can work in parallel.

**Checks on this laptop at `de02abc`:**

| Check | Result |
|---|---|
| Backend `npx tsc --noEmit` | Pass, 0 errors |
| Driver app `npm test` | 11 / 11 pass |
| Website `npm run lint` | 0 errors, 22 warnings |
| Backend Vitest | Not run: needs the Docker Postgres on 5433 (Phase 4) |

**Plan.** `prd.md` now starts with the SDLC master plan; the original requirements are
unchanged in its Part 6. The target is a **production-testing handover by 15 Nov**.

Testing model agreed by Sanath:
- Android and iOS, Hyderabad.
- The three devs test before launch; drivers test after launch.
- Test keys until launch, with one live-key run just before.
- Testers report bugs by call or text; the dev who takes it logs it in a shared bug log.

`tasks.md` now follows the plan's phases. Current phase: **Phase 3** (code-review
fixes, Day-1 accounts, staging server).

**Watch out for:**
- The Apple Developer account approval can take days — start it on Day 1.
- iOS push doesn't work yet: the apps register a raw APNs token, and the backend
  sends through FCM. Decision D-1 proposes an APNs provider in the backend.

## 2026-10-24: review of the pushed commits `bd0d854`, `52c609f` and `cd9de9c`

Three commits landed on `production-p1` after 2026-10-11. `bd0d854` and
`52c609f` were reviewed in full and checked on the laptop; `cd9de9c` arrived
during the session and was read for its effect on the apps only (see below).
This session changed only docs (`progress.md`, `tasks.md`, the two testing
guides), committed and pushed on top of `cd9de9c`.

The local `prototype/backend/package-lock.json` change was identical to the
one in `52c609f`, so it is now committed upstream and there is nothing left
to keep out. It was stashed (`stash@{0}`), not discarded; the stash can be
dropped with `git stash drop`.

**`bd0d854` (Umesh, 18 Oct): onboarding gate, active-trip continuity, booking
and earnings fixes.**

- Driver app: new `src/lib/onboardingGate.js` (11 unit tests, `npm test`).
  The app no longer treats an offline onboarding check as approved. A trip
  already past the handshake (`IN_TRIP`/`ESCALATED`) carries on through a
  network failure if this driver was approved before; going online, offers
  and new trips wait for a fresh server check. The approval and active trip
  are stored in SecureStore per driver; the auth context keeps a cached user
  on a network failure at start-up.
- Driver app: mandatory profile setup (name, vehicle model, plate) before
  going online; `PATCH /v1/driver/profile`; Home shows net earnings; Trip
  summary has an earnings breakdown; Earnings tab per-trip detail; push loads
  `expo-notifications` lazily so Expo Go on Android does not crash.
- Backend: server-side approval checks on going online, offers, accept and
  handshake (`requireApprovedDriver`); stop fees and multi-stop/round-trip
  distance in quote, booking and completion (`fare.ts`); driver earnings
  estimate is fare less the platform fee (was 80%); KYC fills an empty name;
  seed rate card for `MD-Auto` is now 18/km, 260/h ("Auto Spec.").
- Website: place picker, booking fields, multi-stop pricing, Track page.

**`52c609f` (Jaswanth, 21 Oct): telemetry accuracy, auth races, review fixes,
ops feed.** Jaswanth reviewed the 10–11 Oct backend work. He did:

- Amount due charged with a second order on the same checkout page
  (migration `0018`); the user app's completion screen has "Pay ₹X".
- "Driver arrived" (150 m of pickup during `HANDSHAKE_PENDING`): `arrived_at`,
  a `DRIVER_ARRIVED` frame and a customer push.
- `started_at` in the trip API; the driver timer now uses it.
- Practical test date (`assessment_attempts.scheduled_at`), shown in Tests.
- `[BOOK-01]` made deterministic; a cancel that races dispatch retries once.
- Billing distance from a filtered track (jitter, impossible speeds, accuracy
  worse than 50 m, fixes before `started_at`); capped at estimate × 1.5 + 2 km
  with a Safety Desk flag. Mock locations dropped and flagged L1. The driver
  app refuses to end a trip while fixes are still queued, and thins the
  offline queue instead of dropping the oldest fixes.
- User app sends the customer's position during the trip (adds
  `expo-location`, a native module: needs the development build).
- FCM calls time out after 5 s. Left as is: FCM deletes a token on any
  `INVALID_ARGUMENT`, so an iOS APNs token is deleted on its first send.
- Console live board and map over WebSocket (`SUBSCRIBE_OPS`).

**`cd9de9c` (Jaswanth, 24 Oct): car-based tiers, editable fees, safety
defaults, map picker, arrival cancellation fee.** What matters for the apps:

- The server can pick the driver tier from the car (`trips/tier.ts`);
  `required_certification` is now optional. The website uses this. The user
  app still has its tier picker and sends a tier, which the server still
  honours. Whether the app should follow the website is an open question.
- Platform, night, stop and arrival-cancellation fees are editable in the
  console (`pricing_fees`, migrations `0019`, `0020`). This makes the
  hardcoded ₹19 in the driver app (finding 3) wrong whenever ops change it.
- Cancelling after the driver arrives charges a fee paid to the driver. The
  user app's live screen now warns about it, using `arrived_at` and the fee
  from `catalogue.tripConfig()`.
- A driver who lets two offers expire in a row is taken offline; the driver
  app shows "You are offline after missing trip requests" (`DRIVER_OFFLINE`).
- Customer safety defaults (speed limit, share with guardians, female driver
  preference) exist on the backend and website; the user app has no
  settings for them yet.
- Hourly hire now has a 2-hour minimum on the server (the user app already
  had it).

### Checked on the laptop after the fast-forward to `52c609f`

`cd9de9c` was not run through these checks: its app changes are small (the
driver context and the user app's live screen), but the backend suite
should be run again on it.

| Check | Result |
|---|---|
| Driver app unit tests (`npm test`) | 11 pass |
| Driver app lint (oxlint) | Clean |
| Driver app Android bundle | Bundled |
| User app `npm ci`, lint | Two old warnings in `RoutePlannerCard.jsx` |
| User app Android bundle | Bundled |
| Backend typecheck | Passed |
| Backend suite (after migration `0018`) | 382 tests in 33 files pass, including `[BOOK-01]` (28 min on this machine) |

Vendored API clients match `prototype/shared/api-client.js`.

### Review findings (not fixed; nothing was changed in code)

1. **User app shows invented vehicle text.** `src/lib/tripView.js` falls back
   to "Verified Chauffeur" for the vehicle and "ID Verified" (or the
   gearbox and fuel type) for the plate. This breaks the no-invented-data
   rule and puts a claim in the plate field. It should show nothing, or the
   customer's own car from `vehicle_specs`. Came in with `bd0d854`.
2. **Offer poll hits Postgres again.** `listPendingOffers` calls
   `requireApprovedDriver` before the Redis hint, so every poll is a query
   (about 400/s at 1,000 online drivers). Jaswanth's area; added to his list.
3. **Hardcoded ₹19** platform fee as a fallback in `DriverHomeScreen.jsx`
   (offer card) and `TripSummaryScreen.jsx`. The server sends the figure, and
   since `cd9de9c` ops can change it.
4. **Mandatory driver vehicle and plate.** A driver cannot go online without
   their own vehicle model and plate, but MyDriver drivers drive the
   customer's car. Product decision for the team.
5. **Amount due only payable from the completion screen.** The Trips tab
   receipt has no Pay button.
6. **"Driver arrived" barely used in the user app's live screen.** Since
   `cd9de9c` the cancel confirmation uses `arrived_at`, but the screen does
   not tell the customer the driver is waiting, and the `DRIVER_ARRIVED`
   frame is not handled (the screen learns of it only on the next trip read).
7. Any 403 from the operations the driver gate watches (go online, offers,
   accept, handshake, cancel, complete) puts the app on the "Driver access
   restricted" screen and drops the stored approval. Today every such 403 is
   a real approval failure, so this is correct, but a future 403 for another
   reason on `complete` would stop tracking mid-trip.

The website and console changes were not reviewed in depth (Jaswanth's area).
Nothing in either commit has run on a phone.

Machine note: Docker Desktop left open with the backend's containers stopped;
the local database has migration `0018`. `npm ci` was run in the user app
for `expo-location`.

## 2026-10-11 (second session): user app to-do list

Umesh took over Sanath's to-do list for `prototype/mobile/user`.

**State at end of session:** committed and pushed to `production-p1` on
2026-10-11, together with the earlier driver-app and backend work, at Umesh's
instruction and **before Jaswanth or Sanath reviewed it**. Not run on a phone
or emulator, no EAS build. Checked on the laptop: user app lint (three old warnings) and
Android bundle, driver app lint and Android bundle, backend typecheck, backend
suite (359 tests in 32 files; see the note on the smoke test below).

The user app's dependencies had never been installed on this machine
(`npm ci` was run), so nothing about it had been bundled here before.

### The to-do items

| # | Item | State | Main files |
|---|---|---|---|
| 1 | Tier picker from live rate cards | Written. The bundled prices are gone; with no server there is a retry, not stale prices. Refreshes when the app returns to the foreground. | `lib/skills.js`, `SkillPicker.jsx`, `TripContext.jsx`, `booking.js` |
| 2 | Real map | Written. `MapCanvas.jsx` (a drawing with a fake route) is deleted. Needs a Maps key on Android. | `components/TripMap.jsx`, live, matching and complete screens |
| 3 | Push notifications | Written, app and backend. Needs Firebase config to receive a real push. No "driver arrived" push: the backend has no such event. | `lib/push.js`, `TripContext.jsx`, `AuthContext.jsx`, backend below |
| 4 | Silent SOS on triple volume press | Written, behind a switch in Profile (off by default). Foreground only; see the limits in the testing doc. Adds `react-native-volume-manager`, a native module not yet built or run. | `lib/volumeSos.js`, `LiveTripScreen.jsx`, `ProfileScreen.jsx` |
| 5 | Garage in Profile | Written: add, edit, delete, default. The booking form reads the same list and starts on the default car. | `components/GarageCard.jsx`, `CarDetailsForm.jsx`, `TripContext.jsx` |
| 6 | Pay an amount due | **Not built.** The amount is shown (completion screen, receipt, push). Charging it needs new backend payment code; see "Decisions needed". | `TripCompleteScreen.jsx`, `VaultScreen.jsx` |
| 7 | Trip history with receipts | Written: all trips with status, paging, receipt from the payment record, share as text. Email is not built (no backend support). | `VaultScreen.jsx`, `lib/tripView.js` |
| 8 | Empty, error and offline states | Written for every screen that loads data; trip re-read on reconnect and on return to the app. | most screens, `TripContext.jsx` |
| 9 | Accessibility pass | Roles and labels on 40 buttons and 12 inputs, selected states, faint grey text raised to 4.5:1. **Font scaling and small screens not checked**: that needs a phone. | all screens |
| 10 | Icons, splash, store listing | Assets and text done; screenshots not taken. The old icon was a 192 px placeholder. | `assets/`, `docs/store-listing-user.md` |
| 11 | EAS profiles and env | Config written; no build run. Blocked by the stale `android/` folder below. | `eas.json`, `app.config.js`, `.env.production.example` |
| 12 | Remove `prototype/mobile/proto` | **Not done.** Nothing references it, but the delete was blocked by the tool's permission check. Commands below. | |

### Bugs found and fixed along the way

- **The app never showed the pickup code**, so a customer using it could not
  start a trip (`tasks.md` listed this as done). Added to the live trip screen.
- **The price on the Book tab was not the server's.** It was computed in the
  app and included stop fees, a driver allowance and tolls that the server
  does not charge, so it could differ from the amount held at checkout. The
  card now shows the server's quote.
- **A trip escalated by an SOS dropped the customer back to the Book tab**, and
  was not resumed after a restart. `ESCALATED` is now treated as a live trip.
- **Cancel hid a trip that was still running** when the request failed. The
  trip now leaves the screen only when the server confirms. The cancel button
  is hidden once a trip has started.
- A trip cancelled by the driver, or with no driver found, sent the customer
  back to the Book tab with no explanation. There is now an alert.
- The SOS screen claimed "VisionCam stream", "evidence sealing" and "escalated
  to L3", none of which is true, and said "sent" before the server replied.
- The trip-complete screen showed "Ceiling breaches: 0" for every trip, and an
  invented certificate number was built for each history row.
- **Driver app too:** the check for a Maps key read a config field that is
  stripped from the installed app, so the map would never have shown on an
  Android build. Both apps now read `extra.mapsEnabled`, set in `app.config.js`.

### Changes outside the user app

- **Backend (Jaswanth), not reviewed:** new `src/modules/trips/customer-push.ts`,
  called from `broadcastStateChange` in `trips/broadcast.ts`. Sends the
  customer a push when a driver accepts, the trip starts, it ends (saying so
  if an amount is due), it is cancelled by someone else, or no driver is
  found. One extra query per such transition; failures are logged and never
  fail the transition. Four new tests in `tests/integration/trips-lifecycle.test.ts`.
- **Driver app:** `app.config.js` and `src/components/TripMap.jsx`, the Maps
  key fix above.
- The shared API client was not changed.

### Decisions needed

1. **Delete `prototype/mobile/user/android`.** Generated on 2026-08-31 for
   Expo SDK 54; the app is SDK 57. It holds only generated template files.
   While it exists EAS ignores `app.json`'s icon, permissions and plugins.
   `git rm -r prototype/mobile/user/android`, then add `android/` and `ios/`
   to `prototype/mobile/user/.gitignore`.
2. **Delete `prototype/mobile/proto`** (item 12): `git rm -r prototype/mobile/proto`.
3. **Charging an amount due (item 6).** The backend records `amount_due` and
   stops. Collecting it means a second Razorpay order, a migration, changes to
   the checkout page, the verify route and the webhook. That is payment code
   in Jaswanth's module that cannot be tested against Razorpay from here, so
   it was not written. Either Jaswanth builds it, or Umesh does with his
   review before it merges.

### Not verified

- Nothing has run on a phone: maps, push, the volume button, the pickup code,
  the garage, every layout.
- `react-native-volume-manager` 2.2.0 is a legacy-style native module on a
  new-architecture app. It should load through the compatibility layer, but
  that has not been built. If the development build fails on it, remove the
  package and the feature falls back to "not available in this build".
- The backend smoke test `[BOOK-01]` failed once in two full runs and passed
  three times alone. It books and cancels without waiting for dispatch, so it
  depends on timing. The push runs after the transition, so it cannot make
  dispatch finish sooner; the test may need `awaitDispatchIdle()`.

Phone checks are in `docs/user-app-testing.md`.

### Handed to the others (11 Oct 2026)

- `tasks.md` updated: Sanath's to-do items annotated with their state, and new
  items added to Jaswanth's list (review, Firebase apps and Maps key for both
  apps, charging an amount due, a "driver arrived" event, the trip start time,
  the practical test date field, the timing-dependent smoke test).
- Messages for Sanath and Jaswanth were drafted for Umesh to send. Not sent by
  the tool.

### Driver app: what is left apart from phone testing

1. **iOS push.** Not fixed. The app registers the raw APNs token and the
   backend sends through FCM, which cannot use it. Needs a decision from
   Jaswanth and an Apple Developer account.
2. **Practical test date** on the Tests tab: waits on a database field.
3. **Drive timer** counts from when tracking began on the phone: waits on the
   trip API returning a start time.
4. **Store screenshots** and **EAS builds** (development, preview,
   production): need a phone, an Expo login, `google-services.json` and a
   Maps key. No build has ever been run, so a first-build failure is possible.
5. **Review.** Pushed on 2026-10-11, but Jaswanth has not reviewed the
   backend changes.
6. Housekeeping, optional: five Expo packages are a patch version behind
   (`expo`, `expo-auth-session`, `expo-crypto`, `expo-secure-store`,
   `expo-web-browser`); one lint warning comes from the shared API client.

No other unfinished code was found in the driver app.

Machine notes: Docker Desktop was started for the tests and left open with the
backend's containers stopped. `npm ci` was run in `prototype/mobile/user`.
`origin/production-p1` has one newer docs commit (`0239293`), fetched but not
merged; rebase on it before pushing.

## 2026-10-11: audit of the driver app, eleven gaps closed

**State at end of session:** still uncommitted, still not run on a phone.
Checked on the laptop after all changes: backend typecheck, backend suite
(355 tests in 32 files), website lint, driver lint (one old warning in the
vendored client) and the Android bundle all pass.

Most changes are inside `prototype/mobile/driver`. Two reach outside it, made
on Umesh's instruction without waiting for the owners' review:

- **Backend:** `DELETE /v1/me/devices` in `safety-desk/routes.ts`, with one
  new test in `tests/integration/guardian-link.test.ts`.
- **Shared client:** `devices.unregister(token)` in
  `prototype/shared/api-client.js`; `sync.sh` was run, so the user app's and
  website's `src/lib/api.js` changed too. Additive only.

The to-do items were written, but reading the flows end to end found paths
that did not work. Fixed:

| # | Gap | Fix | Files |
|---|---|---|---|
| 1 | A trip cancelled by the customer or the Safety Desk stayed on the phone as a dead trip, and the driver got no more offers until the app was restarted. | The trip is re-read from the server on each state frame, on socket reconnect and on return to the app; a cancelled or reassigned trip is cleared with a message. | `DriverContext.jsx` |
| 2 | The handshake screen's back button did nothing and a driver had no way to cancel (the "too many wrong codes" message said to). | The button is now "Cancel trip", with a confirmation. | `HandshakeScreen.jsx`, `DriverContext.jsx` |
| 3 | Reopening the app mid-drive showed the pre-trip inspection again; on an `ESCALATED` trip it was an endless spinner, hiding the drive screen and SOS. | The server is asked whether the pre-trip inspection is sealed; an escalated trip goes straight to the drive screen; a failed inspection load shows an error and a retry. | `DriverFlow.jsx`, `InspectionScreen.jsx` |
| 4 | Tapping End trip by mistake forced all 8 drop-off photos with no way back. | Back button on the drop-off inspection. | `InspectionScreen.jsx`, `DriverFlow.jsx` |
| 5 | If a trip ended while the app was closed, the location service kept running. | Stopped on the next launch when there is no trip being driven. | `DriverContext.jsx` |
| 6 | Trip summary showed "payout (82%)" (the real rule is fare less the platform fee), invented score text, and "1 min" after a restart. | Server figures only; anything this phone did not measure is left out. | `TripSummaryScreen.jsx`, `DriverContext.jsx` |
| 7 | The drive timer restarted from 00:00 on reopening the app or returning from the inspection. | Counted from when tracking began, saved with the telemetry queue. | `telemetry.js`, `DriveActiveScreen.jsx` |
| 8 | Logging out left the driver online, so dispatch kept offering trips to a signed-out phone. A replaced push token was never re-registered. | Go offline before sign-out; listen for token changes. | `ProfileScreen.jsx`, `push.js` |
| 9 | `expo-dev-client` was not installed, so the development build in the testing doc could not load the app from the laptop. | Installed (`~57.0.19`). | `package.json`, `package-lock.json` |
| 10 | Profile and the reminders told the driver to upload a renewed document, but only onboarding had an upload screen. | "Upload renewed document" on any document that is expiring, expired or rejected: new expiry date, then camera or gallery. It goes to ops for review in the console; the old verified licence keeps the driver approved until then (no backend change needed). | `ProfileScreen.jsx` |
| 11 | A signed-out phone kept the account's push token, so it kept ringing for offers. | The token is removed at logout, from Profile and from onboarding. | `push.js`, `ProfileScreen.jsx`, `OnboardingScreen.jsx`, backend and shared client as above |

Not done, and why:

- **Item 9** (battery and data), store screenshots, any EAS build: these need
  a phone, an Expo account, `google-services.json` and a Maps key.
- **iOS push.** The backend sends through FCM, which cannot use the APNs
  token the app registers on iOS. Fixing it means adding the Firebase SDK to
  the iOS app or sending to APNs from the backend, and cannot be tested
  without an Apple Developer account. Android is unaffected.
- **Practical test dates.** The database has no field for one, so the Tests
  tab says "MyDriver will contact you with a date".
- The drive timer counts from when tracking began on this phone. If the app's
  storage is cleared mid-trip it restarts, because the trip API does not
  return a start time.
- Lint reports one warning in the vendored `src/lib/api.js` line 124
  (`no-useless-fallback-in-spread`). It comes from `shared/api-client.js`, so
  it was left alone.

Phone checks for these fixes are in `docs/driver-app-testing.md`, sections 12
and 13.

Next steps for Umesh:

1. Get `google-services.json` and a Maps SDK for Android key, then make a
   development build and work through `docs/driver-app-testing.md`.
2. Run the 2-hour battery and data test (item 9) and fill in the table.
3. Take store screenshots.
4. Commit (leaving out `prototype/backend/package-lock.json`), fetch, rebase
   on `origin/production-p1`, and push. Tell Jaswanth and Sanath about the
   backend and shared-client changes, which they have not reviewed.

Machine note: Docker Desktop was left open with the three containers stopped.

## 2026-10-10: polling fixes verified, driver-app to-do items 1–11 written

**State at end of session:** everything below is uncommitted on
`production-p1`, waiting for Jaswanth's review. Nothing has been run on a
phone. Nothing in `tasks.md` has been struck through for that reason.

### What was verified on the laptop

| Check | Result |
|---|---|
| Backend typecheck | Passed |
| Backend tests (`npm test`) | Passed, 354 tests in 32 files |
| Website CI lint | Passed |
| Driver app lint (oxlint) | Clean |
| Driver app Android bundle (`expo export`) | Bundled, 2,889 modules |
| Anything on a real phone, EAS builds, iOS | **Not done** |

### Job 1: polling fixes (Jaswanth's area)

- The six fixes in `docs/handoff-polling-fixes.md` match the code and pass the
  suite, including the audit-throttle test.
- **Telemetry during `ESCALATED` was a real bug, now fixed.** Location was
  rejected with 409 `TRIP_NOT_ACTIVE` while an incident was open. Both checks
  (`realtime/gateway.ts`, `trips/telemetry-routes.ts`) now call
  `acceptsTelemetry()` in `trips/state-machine.ts`. Two new tests fail without
  the fix. This is the safety path and needs Jaswanth's review.
- `minio/minio` can no longer be pulled, so `infra:up` failed. The dev compose
  file now uses `cgr.dev/chainguard/minio:latest` (unpinned tag; Jaswanth may
  want to pin it).

### Job 2: driver app (`prototype/mobile/driver`)

| # | Item | State | Main files |
|---|---|---|---|
| 1 | Push for offers | Written, not phone-tested. Needs Firebase config to receive a real push. | `src/lib/push.js`, `DriverContext.jsx` |
| 2 | Background location | Written, not phone-tested | `src/lib/tracking.js`, `app.json` |
| 3 | Offline buffering | Written, not phone-tested | `src/lib/telemetry.js` |
| 4 | Post-trip inspection, upload retry | Written, not phone-tested | `InspectionScreen.jsx`, `DriverFlow.jsx` |
| 5 | Map and navigation | Written, not phone-tested. Android map needs a Maps key. | `src/components/TripMap.jsx` |
| 6 | Earnings tab | Written, backend tested | `EarningsScreen.jsx` |
| 7 | Tests tab | Written, backend tested | `AssessmentsScreen.jsx` |
| 8 | Profile tab, expiry reminders | Written, backend tested; reminders not phone-tested | `ProfileScreen.jsx` |
| 9 | Battery and data over 2 hours | **Not done.** Phone-only; procedure in the testing doc. | `docs/driver-app-testing.md` |
| 10 | Icons, splash, store listing | Assets and text done; screenshots not taken | `assets/`, `docs/store-listing-driver.md` |
| 11 | EAS profiles and env | Config written; no build run | `eas.json`, `app.config.js`, `.env.production.example` |

Also fixed along the way: the app dropped an `ESCALATED` trip on restart; the
home screen showed invented figures; login and signup had hardcoded hex colours.

### Changes outside the driver app (need the owner's review)

- **Backend (Jaswanth):** new `src/modules/driver-app/` with
  `GET /v1/driver/earnings`, `/assessments`, `/profile` and 9 tests; a
  `channel` field on push payloads (`providers/push/index.ts`, `fcm.ts`) and
  `data.type: 'TRIP_OFFER'` on offer pushes (`matching.ts`).
- **Shared client (Sanath and Jaswanth):** `prototype/shared/api-client.js`
  gained `driver.earnings()`, `driver.assessments()`, `driver.profile()`, and
  `sync.sh` was run, so the user app's and website's `src/lib/api.js` changed
  too. Additive only. This was done without flagging it first.

### Waiting on Jaswanth

1. Review of all the backend changes above, the telemetry fix and the MinIO
   image swap.
2. A Firebase project with Android apps for `com.mydriver.driver`,
   `.preview` and `.dev`, and its `google-services.json`.
3. `FCM_SERVICE_ACCOUNT_JSON` and `PUSH_PROVIDER=fcm` on the server.
4. A Maps SDK for Android key.
5. A decision on iOS push: the backend sends through FCM, which cannot use
   the raw APNs token the app registers on iOS.
6. Practical test dates have no database field, so the Tests tab cannot show
   one.

### Next steps for Umesh

1. Send the review request to Jaswanth.
2. Make a development build (`npx eas-cli build --profile development
   --platform android`) and work through `docs/driver-app-testing.md`.
3. Run the 2-hour battery and data test (item 9) and fill in the table.
4. Take store screenshots.
5. After review, commit (leaving out `prototype/backend/package-lock.json`),
   then fetch, rebase on `origin/production-p1`, and push.

### Machine notes

- `kairos-redis` and `kairos-mysql` (another project) were stopped because
  `kairos-redis` held port 6380. They were not restarted.
- If backend tests all time out, the Redis container has no published port:
  `docker compose up -d --force-recreate redis` in `prototype/backend`.
- Pre-existing, left alone: `expo-auth-session`, `expo-crypto`,
  `expo-secure-store` and `expo-web-browser` are a patch version behind.

## Prompt for the next session

Paste this into a new session:

```text
I'm Umesh. I work in D:\MyDriver\My-Driver (branch production-p1, remote
Jaswanth-K1210/My-Driver). I own the driver app, prototype/mobile/driver, and
I have taken over the user app's to-do list, prototype/mobile/user (it was
Sanath's). Both are Expo SDK 57, RN 0.86, JS. Jaswanth owns the backend,
website, console and infra.

Start by reading progress.md (the 2026-10-24 section first), tasks.md,
docs/driver-app-testing.md and docs/user-app-testing.md, then run git fetch,
git status and git log -8. If origin has commits newer than the docs
describe, read what they change in the two apps before anything else. Do not
re-do work those files describe.

Where things stand (end of 2026-10-24): production-p1 has my docs commit on
top of Jaswanth's cd9de9c. Jaswanth reviewed my backend work (52c609f) and
built the amount-due charge, "driver arrived", started_at in the trip API,
the practical test date and a fix for [BOOK-01]. Then (cd9de9c) car-based
tiers, console-editable fees, customer safety defaults, an arrival
cancellation fee and taking a driver offline after missed offers. My commit
bd0d854 added the driver app's approval gate, active-trip continuity and
mandatory profile setup. Sanath has not reviewed the user app.

Checked on the laptop at 52c609f: driver unit tests (11), both apps lint and
bundle for Android, backend typecheck, backend suite (382 tests in 33 files).
cd9de9c has NOT been checked: run the backend suite and both apps' lint on it
first. Nothing has run on a phone or emulator and no EAS build has been made.

Open review findings (details in progress.md, 2026-10-24), all unfixed:
1. User app tripView.js shows "Verified Chauffeur" / "ID Verified" as the car
   and plate when there are none (made-up data).
2. Offer poll queries Postgres on every poll again: listPendingOffers runs
   requireApprovedDriver before the Redis hint (Jaswanth's code).
3. Hardcoded Rs 19 platform-fee fallbacks in the driver Home offer card and
   Trip summary; fees are now editable in the console.
4. Drivers must enter their own vehicle and plate to go online, though they
   drive the customer's car: a product decision for the team.
5. The amount due can only be paid from the trip-complete screen; the Trips
   tab receipt has no Pay button.
6. The user app's live screen does not tell the customer the driver has
   arrived (only the cancel warning uses arrived_at; DRIVER_ARRIVED frame
   not handled).
7. Any 403 on the driver's complete call would stop tracking mid-trip (fine
   today, every such 403 is an approval failure).
Also open: the user app still has its tier picker while the website lets the
server pick the tier from the car; the user app has no settings for the new
safety defaults.

Still open from before:
- Two deletions I have to approve or run myself (the tool was blocked):
    git rm -r prototype/mobile/user/android   (generated for SDK 54, the app is
      SDK 57; while it exists EAS ignores app.json's icon, permissions and
      plugins, so no user-app build will be right until it is gone; then add
      android/ and ios/ to prototype/mobile/user/.gitignore)
    git rm -r prototype/mobile/proto          (nothing references it)
- Phone work for both apps: the two testing docs (driver section 14 and the
  user app's amount-due, arrival and location checks are new), the driver
  app's item 9 (battery and data over 2 hours), font scaling and small
  screens in the user app, store screenshots, EAS builds. These need a phone,
  an Expo login, google-services.json for both apps and a Maps SDK for
  Android key.
- Amount due: only run against the mock payment provider, not Razorpay test mode.
- iOS push, both apps: the backend sends through FCM, which cannot use the raw
  APNs token the apps register, and deletes it on the first send. Needs an
  Apple Developer account to test.
- react-native-volume-manager and expo-location in the user app are native
  modules that have never been built. If the development build fails on the
  volume manager, remove it; the app then says the feature is unavailable.
- stash@{0} holds an old copy of the backend lockfile change, now committed
  upstream; it can be dropped.

Rules for this repo:
- The API client is vendored. Edit only prototype/shared/api-client.js, then
  run prototype/shared/sync.sh. Never edit src/lib/api.js in an app directly.
- Design tokens are red, white and neutral only. No green, amber or blue, no
  hardcoded hex colours.
- No mock or simulated data on screens. Prices and fees come from the server.
- Commit or push only when I ask. Before pushing, fetch and rebase on
  origin/production-p1.
- This machine is short on memory. Run one heavy command at a time, never the
  test suite and a lint together, and stop Docker's containers when you are
  done with them. The backend suite takes about 30 minutes here; run it in
  the background.
- The backend and website belong to Jaswanth. If an app needs a change there,
  make it yourself rather than wait, keep it small and additive, add a test,
  and list it in your report and in progress.md. Do not write payment code
  without his review.

What I will bring to this session (ask me which applies):
a) google-services.json and a Maps key: wire them into both apps and walk me
   through a development build and the phone tests.
b) Results or bugs from phone testing: fix them one at a time.
c) Review comments from Jaswanth or Sanath: apply them, re-run the affected
   tests, report.
d) A go-ahead on the two deletions.
e) Fix the open review findings (1, 3, 5, 6 are in the apps), iOS push, or
   anything else I name.

Work one item at a time, tell me how to test each on a real phone, and say
plainly what you could not verify yourself. Update progress.md, tasks.md and
the testing docs at the end.
```

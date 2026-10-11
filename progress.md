# Progress: Umesh (driver app, and the user app from 2026-10-11)

Latest session first. `tasks.md` holds the task list; this file records what
was actually done and what state it is in.

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

Start by reading progress.md, tasks.md, docs/driver-app-testing.md and
docs/user-app-testing.md, then run git status and git log -8. Do not re-do
work those files describe.

Where things stand (end of 2026-10-11): everything is committed and pushed to
production-p1. Jaswanth and Sanath have NOT reviewed it yet; I sent them
messages. Checked on the laptop only: both apps lint and bundle for Android,
backend typecheck, backend suite (359 tests in 32 files). Nothing has run on
a phone or emulator and no EAS build has ever been made.

Driver app: to-do items 1 to 8, 10 and 11 are written and an audit closed
eleven gaps in the trip flows.
User app: to-do items 1 to 5 and 7 to 11 are written, plus a backend module
that sends the customer trip notifications (trips/customer-push.ts).

Still open:
- Two deletions I have to approve or run myself (the tool was blocked):
    git rm -r prototype/mobile/user/android   (generated for SDK 54, the app is
      SDK 57; while it exists EAS ignores app.json's icon, permissions and
      plugins, so no user-app build will be right until it is gone; then add
      android/ and ios/ to prototype/mobile/user/.gitignore)
    git rm -r prototype/mobile/proto          (nothing references it)
- Phone work for both apps: the two testing docs, the driver app's item 9
  (battery and data over 2 hours), font scaling and small screens in the user
  app, store screenshots, EAS builds. These need a phone, an Expo login,
  google-services.json for both apps and a Maps SDK for Android key.
- User app item 6, charging an amount due: not built. The backend records
  amount_due and nothing collects it. Needs a second Razorpay order, a
  migration, and changes to the checkout page, verify route and webhook.
  Waiting on Jaswanth's decision on who writes it.
- iOS push, both apps: the backend sends through FCM, which cannot use the raw
  APNs token the apps register. Needs an Apple Developer account to test.
- Waiting on the backend: a trip start time in the trip API (driver timer), a
  field for the practical test date (driver Tests tab), a "driver arrived"
  event (customer push).
- react-native-volume-manager in the user app is a native module that has
  never been built with it. If the development build fails on it, remove the
  package; the app then says the feature is unavailable.
- Backend smoke test [BOOK-01] depends on timing and failed once in two full
  runs.

Rules for this repo:
- The API client is vendored. Edit only prototype/shared/api-client.js, then
  run prototype/shared/sync.sh. Never edit src/lib/api.js in an app directly.
- Design tokens are red, white and neutral only. No green, amber or blue, no
  hardcoded hex colours.
- No mock or simulated data on screens. Prices come from the server.
- prototype/backend/package-lock.json has an unrelated local change. Leave it
  out of every commit.
- Commit or push only when I ask. Before pushing, fetch and rebase on
  origin/production-p1.
- This machine is short on memory. Run one heavy command at a time, never the
  test suite and a lint together, and stop Docker's containers when you are
  done with them.
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
d) A go-ahead on the two deletions, or on charging an amount due.
e) More implementation: iOS push, or anything else I name.

Work one item at a time, tell me how to test each on a real phone, and say
plainly what you could not verify yourself. Update progress.md and tasks.md
at the end.
```

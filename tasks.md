# MyDriver: Tasks

Owners: **Sanath** (user app) · **Umesh** (driver app) · **Jaswanth** (backend, website,
operations console, infrastructure).

Completed tasks are ~~struck through~~. **Status as of 25 Oct 2026, branch `production-p1` at
`de02abc`.**

- **Plan:** the phase plan to the **15 Nov production-testing handover** (Android + iOS,
  Hyderabad) is in [`prd.md`](prd.md), Parts 1–5. This file follows its phases.
- **Code review:** findings `CR-#` (CodeRabbit) and `M-#` (manual audit) come from the 25 Oct
  review (summary in `progress.md`, 25 Oct).
- **Phone check:** "Written" means the code exists, lints and bundles but has **not been run
  on a phone**. Those items are struck through only after the Phase 5 phone tests
  (`docs/user-app-testing.md`, `docs/driver-app-testing.md`).

## Where we are

| Phase | Status |
|---|---|
| 1. Backend, database, auth, dispatch | Done |
| 2. Features on all four surfaces | Code complete |
| **3. Code-review fixes, accounts, staging** | **Current (≈5 days, 26–30 Oct)** |
| 4. Full-stack checks + first dev builds | Next (≈3 days) |
| 5. Dev testing on real Android and iOS phones in Hyderabad | ≈7 days |
| 6. Code freeze, live-key dry run, handover | ≈3 days + 3-day buffer → **15 Nov** |
| 7. Hyderabad driver field pilot, store release | After launch |

---

## Everyone: Day-1 accounts and decisions (`prd.md` Part 4)

- [ ] X-1 Apple Developer Program (organisation) + App Store Connect: **Sanath**
- [ ] X-2 Expo/EAS organisation: **Sanath** (user app), **Umesh** (driver app)
- [ ] X-3 Firebase project, Android + iOS apps, APNs key: **Jaswanth** creates it; Sanath and
      Umesh register their own apps
- [ ] X-4 Google Maps keys for Android and iOS: **Jaswanth**
- [ ] X-5 Staging server, domain, DNS: **Jaswanth**
- [ ] X-6 Razorpay and Cashfree live activation (stay on test keys until the dry run): **Jaswanth**
- [ ] X-7 Google Play Console, internal testing track: **Umesh**
- [ ] D-1 iOS push: add an APNs provider in the backend (decide together)
- [ ] D-2 iOS distribution through TestFlight (Sanath, Umesh)
- [ ] D-3 Drivers' own vehicle and plate optional before going online? (Umesh, Jaswanth)
- [ ] D-4 Hyderabad service area, rate cards and fees on staging (Jaswanth)
- [ ] Shared bug log for testers' calls and texts (`prd.md` §3.5): **Sanath**

---

## Sanath: User app (`prototype/mobile/user`)

### Done
- [x] ~~Phone OTP and Google sign-in, sign-up~~
- [x] ~~Expo SDK 57 upgrade~~
- [x] ~~Booking home: requirement tabs, route planner with stops and round trip, duration rules~~
- [x] ~~Inter-city, airport and full-time forms (full-time behind a phase toggle)~~
- [x] ~~Live place search in location pickers~~
- [x] ~~Car details: Saved Garage from `/v1/me/vehicles` and a new-vehicle form~~
- [x] ~~Speed limit slider and live server quote~~
- [x] ~~Payment step: authorise the hold through hosted checkout before dispatch~~
- [x] ~~Matching screen, cancel trip~~
- [x] ~~Live trip: real driver position over WebSocket, speed against the limit, pickup OTP~~
- [x] ~~Share guardian link, hold-to-arm silent SOS~~
- [x] ~~Trip complete: fare, rating~~
- [x] ~~Trip Vault: past trips, inspection photos, trip certificate~~
- [x] ~~Profile: guardians (add/remove), optional PAN + Aadhaar verification, sign out~~
- [x] ~~Red + neutral palette across the app~~
- [x] ~~Tier picker removed: the server picks the tier from the car, as on the website
      (`de02abc`)~~
- [x] ~~Safety defaults (speed limit, share with guardians, female driver preference): one-time
      prompt on Home and settings in Profile (`de02abc`)~~
- [x] ~~Live screen shows "Driver has arrived" from the `DRIVER_ARRIVED` frame (`de02abc`)~~
- [x] ~~"Pay ₹X" for the amount due on the Trips tab receipt as well as the completion screen
      (`de02abc`)~~
- [x] ~~No more "Verified Chauffeur" / "ID Verified" placeholders when a car has no model or
      plate (`de02abc`)~~
- [x] ~~Hourly hire 2-hour minimum, matching the server (`31c72a0`)~~

### Phase 3: code-review fixes
- [ ] **CR-1 + M-2 (major)** `src/lib/booking.js`: send stops and return stops with `lat`/`lng`;
      stop turning Within-City trips over 8 hours into `HOURLY`; send `return_drop` for
      outstation round trips
- [ ] **M-5** Show the "Stops fee" line in the quote breakdown (`HomeScreen.jsx`)
- [ ] **CR-7** Saving safety defaults and `refreshMe()` in their own try/catch so an error never
      blocks booking
- [ ] **CR-8** Do not show transmission/fuel as the plate (`src/lib/tripView.js`)
- [ ] **M-8** Delete `prototype/mobile/user/android` (generated for SDK 54; while it exists EAS
      ignores the icon, permissions and plugins in `app.json`) and `prototype/mobile/proto`
      (nothing references it): `git rm -r prototype/mobile/user/android prototype/mobile/proto`,
      then ignore `android/` and `ios/`
- [ ] **CR-10** Update `docs/user-app-testing.md` where it contradicts the code

### Written, waiting for a phone check (Phase 4–5)
- [ ] Real map on the live trip and matching screens (react-native-maps). Needs the Maps keys
- [ ] Push notifications: device registration; driver matched, arrived, trip started/ended,
      payment due. Needs Firebase config, and D-1 for iOS
- [ ] Silent SOS on triple volume-button press (`react-native-volume-manager`, behind a switch
      in Profile; check iOS behaviour separately)
- [ ] Customer position sent during the trip (`expo-location`)
- [ ] Garage management in Profile: add, edit, delete, set a default car
- [ ] Pay an outstanding amount due (Razorpay test mode)
- [ ] Trip history with receipts (shared as text; email waits on the backend)
- [ ] Empty, error and offline states; retry when the network drops mid-trip
- [ ] Accessibility: labels, roles and contrast written; font scaling and small screens not
      checked
- [ ] Run all 11 suites of `docs/user-app-testing.md` on Android **and** iOS, including
      Hyderabad routes (within city, RGIA airport, multi-stop, outstation round trip)

### Builds and release
- [ ] Development builds for Android and iOS against staging (Phase 4)
- [ ] Preview builds: Android APK, iOS TestFlight; submit for TestFlight external review by the
      end of Phase 5
- [ ] Store screenshots (`docs/store-listing-user.md`; icons, splash and listing text done)
- [ ] Release-candidate builds from the `v0.9.0-prodtest` tag; handover pack (Phase 6)

---

## Umesh: Driver app (`prototype/mobile/driver`)

### Done
- [x] ~~Phone OTP and Google sign-in, sign-up~~
- [x] ~~Expo SDK 57 upgrade (image picker, location, sensors at SDK 57 versions)~~
- [x] ~~Onboarding: PAN + Aadhaar OTP verification, driving licence upload, status and blockers~~
- [x] ~~Go online/offline with the current position~~
- [x] ~~Trip offers: view, accept, decline~~
- [x] ~~Pickup handshake: selfie liveness + customer OTP~~
- [x] ~~8-point car inspection with photo capture~~
- [x] ~~Active drive: live location streaming, speed against the limit, harsh-motion detection~~
- [x] ~~Silent SOS from the driver side~~
- [x] ~~Complete trip and trip summary; today's earnings on home~~
- [x] ~~Onboarding gate: an offline check is never treated as approved; an active trip carries on
      (`onboardingGate.js`, 11 unit tests, `bd0d854`)~~
- [x] ~~Console approval decisions arrive over WebSocket (`31c72a0`)~~
- [x] ~~Platform fee read from `/v1/catalogue/trip-config` instead of a hardcoded ₹19
      (`bc34996`)~~
- [x] ~~Fined trips (arrival cancellation fee) labelled in Earnings (`31c72a0`)~~

### Phase 3: code-review fixes
- [ ] **CR-4 (major, crash during live trips)** `DriverContext.jsx` `toRequest()`: never use a
      `{lat,lng}` object as the pickup/drop text
- [ ] **M-1 follow-up** After Jaswanth's M-1 lands: keep the rich offer fields in `toRequest`,
      and check the offer card on both the WebSocket and polling paths
- [ ] Onboarding: poll `/v1/driver/onboarding` every 10 s while `UNDER_REVIEW`
- [ ] Remove the `MODULE_TYPELESS_PACKAGE_JSON` warning on `npm test`
- [ ] D-3 with Jaswanth: drivers' own vehicle and plate optional before going online

### Written, waiting for a phone check (Phase 4–5)
- [ ] Background location (foreground service on Android; on iOS, the "Always" permission and
      background mode)
- [ ] Offline telemetry queue, thinning, flush before completion
- [ ] Push for new offers (`offers` channel, sound and vibration). iOS depends on D-1
- [ ] Real map with one-tap Google Maps navigation
- [ ] Earnings, Assessments (practical test date) and Profile (document expiry reminders,
      renewed licence upload)
- [ ] Inspection: blocks completion until all 8 photos upload; per-photo retry
- [ ] Run all 14 suites of `docs/driver-app-testing.md` on Android **and** iOS
- [ ] Battery and data use during a 2-hour trip, on one Android phone and one iPhone

### Builds and release
- [ ] Development builds for Android and iOS against staging (Phase 4)
- [ ] Preview builds: Android APK / Play internal track, iOS TestFlight; submit for TestFlight
      external review by the end of Phase 5
- [ ] Store screenshots (`docs/store-listing-driver.md`)
- [ ] Release-candidate builds from the `v0.9.0-prodtest` tag (Phase 6)

---

## Jaswanth: Backend, website, console, infrastructure

### Backend: done
- [x] ~~Fastify + TypeScript API, Postgres/TimescaleDB, PgBouncer, Redis, MinIO/S3~~
- [x] ~~Auth: phone OTP, Google, staff email/password, refresh tokens, roles~~
- [x] ~~Trips: quote, book, dispatch (geo index), offers, handshake, inspection, complete, rate~~
- [x] ~~Payments: Razorpay authorise at booking, capture at end, release on cancel, signed
      idempotent webhooks, hosted checkout page~~
- [x] ~~KYC: Cashfree PAN + Aadhaar OTP, last-4 storage, approval blockers~~
- [x] ~~Integrity engine: speed, route deviation, lost telemetry; L0–L5 escalations; silent SOS~~
- [x] ~~Guardians, guardian tracking links, consents~~
- [x] ~~Garage (`/v1/me/vehicles`), locations proxy, catalogue trip-config, device registration~~
- [x] ~~Driver onboarding, documents, assessments, badges, Night Shield, payouts~~
- [x] ~~Admin endpoints: trip search/detail, customer lookup, overview, pricing (audited),
      settings, live drivers, driver activity (earnings, escalations, SOS, warnings)~~
- [x] ~~Demo data (`npm run seed:demo`) with the `ADMIN_DEMO_DATA` toggle; demo drivers on the
      map and never dispatched~~
- [x] ~~Production guards, security headers, log redaction, metrics token~~
- [x] ~~Development-only overrides (auto-approve, 50 km radius) kept out of production~~
- [x] ~~342 backend tests passing~~ (as of 12 Oct; re-run on `de02abc` in Phase 4 — 35 test
      files, needs Docker)
- [x] ~~Amount due second order (migration `0018`); "driver arrived" (150 m); `started_at` /
      `arrived_at`; practical test date; filtered billing distance with cap and flag
      (`52c609f`)~~
- [x] ~~Car-based tiers, console-editable fees, safety defaults, arrival cancellation fee,
      auto-offline after 2 missed offers (migrations `0019`, `0020`, `cd9de9c`)~~
- [x] ~~Offer poll load: Redis hint checked before the approval query again (`de02abc`)~~

### Website: done
- [x] ~~Public site with a unified header, login-gated actions that return you to where you
      were, logo back to the public site~~
- [x] ~~"Join as a driver" with Coming-soon store links; no operator link on the customer site~~
- [x] ~~Booking with live place search, Garage and profile edit; fixed the pickup in the payload~~
- [x] ~~Phase toggles (bus, caravan, scheduled pickup, full-time off; data kept)~~
- [x] ~~Live prices on the marketing pages from rate cards~~
- [x] ~~Map picker, Photon geocoder fallback, multi-stop/round-trip pricing, safety defaults,
      `ESCALATED` / `NO_DRIVERS_FOUND` handling (`bd0d854`, `cd9de9c`)~~

### Operations console: done
- [x] ~~Separate build and subdomain (admin.mydriver.in), origin checks, optional IP allowlist~~
- [x] ~~Overview, live board, trips, customers, drivers with filters, check-ins, Night Shield,
      grading, payments, payouts, pricing, audit ledger~~
- [x] ~~Live map with demo drivers; plates only for drivers on a trip~~
- [x] ~~Click a driver on the map: live trip details and the driver's earnings, trips,
      escalations, SOS and warnings; same section on the driver profile~~
- [x] ~~Live board and live map over WebSocket (`SUBSCRIBE_OPS`)~~
- [x] ~~Editable fees in Pricing (`cd9de9c`)~~

### Infrastructure: done
- [x] ~~Dockerfiles, `deploy/docker-compose.prod.yml`, Caddy auto-TLS, `.env.production.example`~~
- [x] ~~GitHub Actions CI (backend tests, website lint and builds)~~
- [x] ~~Merge `main` and `validation` into `production-p1`~~

### Phase 3: code-review fixes
Do first, because the apps depend on them:
- [ ] **M-1 (major)** `GET /v1/driver/offers`: add `stops`, `return_stops`, `vehicle_specs`,
      `vision_mode`, `flight_number`, `requirement`, `trip_type` to the response schema
- [ ] **M-4 (major)** `resolveEscalation()`: publish `TRIP_STATE_CHANGED → IN_TRIP`
- [ ] **CR-2 (major)** `setOnboardingStatus()`: cancel an unapproved driver's `MATCHED` /
      `HANDSHAKE_PENDING` trips (no arrival fee) before taking them offline
- [ ] Staging server up on the current code; Firebase config and Maps keys to Sanath and Umesh

Then:
- [ ] **CR-3 (major, privacy)** `PlacePicker.jsx`: reverse geocoding through
      `api.locations.reverse()` instead of the browser calling public Nominatim
- [ ] **M-3 (major)** Website "Pay ₹X balance" for `amount_due > 0` in `Track.jsx` and `Vault.jsx`
- [ ] **M-6 + D-1** `fcm.ts`: do not delete tokens on a generic `INVALID_ARGUMENT`; add an
      APNs provider for iOS tokens
- [ ] **CR-5** Guard `a.details?.tracked_km` in `TripDetail.jsx`
- [ ] **CR-6** Block empty or negative inputs in `Pricing.jsx`
- [ ] **CR-7** Saving safety defaults in its own try/catch in `Book.jsx`
- [ ] **CR-8** Do not show transmission/fuel as the plate in `website/src/lib/tripView.js`
- [ ] **M-7** Active-trip rows clickable in `Board.jsx`
- [ ] **CR-9 / CR-11** Regenerate `api-documentation.md`
- [ ] D-3 with Umesh; D-4 Hyderabad setup on staging

### Phase 4–6
- [ ] Backend suite on Docker (`infra:up`, `db:migrate`, `npm test`); website lint + both builds
- [ ] Amount due against Razorpay test mode (only the mock provider has been run)
- [ ] Watch the console during the Phase 5 road tests; same-day fixes for P0/P1 bugs
- [ ] Production-testing server: TLS for mydriver.in, api. and admin.; migrations; staff
      accounts; `ADMIN_DEMO_DATA=hide`; Postgres PITR backups; uptime and error alerts
- [ ] **Live-key dry run:** one real ride with live Razorpay + Cashfree, then back to test keys
- [ ] Merge `production-p1` into `main` (PR #1) once CI is green

### After launch (Phase 7)
- [ ] Live SMS with DLT templates (Twilio/MSG91), voice (Exotel/Twilio), liveness, S3 versioning
- [ ] Safety Desk one-click call and SMS to driver, customer and guardians
- [ ] Email receipts after a trip
- [ ] Automated driver payouts (RazorpayX or bank file) instead of a manually entered UTR
- [ ] Load test dispatch and the telemetry WebSocket at the pilot's expected peak
- [ ] Replace the "Coming soon" store links on the website when both apps are published
- [ ] Phase 2: full-time contracts, bus, caravan, scheduled pickup (switch the toggles on and
      test), corporate accounts, evidence release to law enforcement

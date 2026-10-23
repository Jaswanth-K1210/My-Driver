# MyDriver: Tasks

Owners: **Sanath** (user app) · **Umesh** (driver app) · **Jaswanth** (backend, website,
operations console, infrastructure).

Completed tasks are ~~struck through~~. Status as of 24 Oct 2026, branch `production-p1` after
`cd9de9c`. Sanath's and Jaswanth's to-do lists were annotated by Umesh on 11 Oct 2026 with work he
did in their areas. Jaswanth reviewed the backend part of it on 21 Oct (`52c609f`).

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

### To do

Umesh worked through this list on 11 Oct 2026. The work is pushed but unreviewed and has **not been run
on a phone**, so nothing is struck through yet. "Written" means the code exists, lints and
bundles. Details in `progress.md`; phone checks in `docs/user-app-testing.md`.

- [ ] Driver tier picker: read tiers and prices from the live rate cards (`useTrip().skills`)
      instead of `data/mock` `SKILLS`, so console price changes show in the app
      — **Written.** Needs a phone check.
- [ ] Real map on the live trip and matching screens (react-native-maps), replacing `MapCanvas`
      — **Written.** Needs a Maps SDK for Android key and a phone check.
- [ ] Push notifications: register the device (`api.devices.register`) and handle driver
      matched, driver arrived, trip started/ended, and payment due
      — **Written**, app and backend. "Driver arrived" is now sent by the backend (Jaswanth,
      21 Oct); the app shows it as a notification but the live screen does not yet use
      `arrived_at` or the `DRIVER_ARRIVED` frame. Needs `google-services.json` and a phone check.
- [ ] Silent SOS on triple volume-button press
      — **Written**, behind a switch in Profile, off by default. Works only with the trip
      screen open. Adds the native module `react-native-volume-manager`, not yet built.
- [ ] Garage management in Profile: add, edit, delete and set a default car
      — **Written.** Needs a phone check.
- [ ] Pay an outstanding amount due after a trip that ran over its hold
      — **Written** (Jaswanth, 12 Oct): "Pay ₹X" on the completion screen opens the same
      checkout page, which now collects the amount due. Needs a phone check. Gap: the Trips
      tab receipt shows "Still to pay" with no Pay button, so a customer who leaves the
      completion screen has no way back to it.
- [ ] Trip history list with receipts (and email a receipt once the backend supports it)
      — **Written**, with sharing as text. Email waits on the backend.
- [ ] Empty, error and offline states on every screen; retry when the network drops mid-trip
      — **Written.** Needs a phone check.
- [ ] Accessibility pass (labels, font scaling, contrast) and small-screen layout check
      — Labels, roles and contrast **written**. Font scaling and small screens **not checked**
      (needs a phone).
- [ ] App icons, splash screen, store listing text and screenshots
      — Icons, splash and `docs/store-listing-user.md` done. **Screenshots not taken.**
- [ ] EAS build profiles and production `.env`; internal TestFlight and Play testing builds
      — Config written (`eas.json`, `app.config.js`, `.env.production.example`). **No build
      run**: blocked until `prototype/mobile/user/android` is deleted (next item).
- [ ] Delete `prototype/mobile/user/android`: generated for Expo SDK 54, the app is SDK 57, and
      while it exists EAS ignores the icon, permissions and plugins in `app.json`
      (`git rm -r prototype/mobile/user/android`, then ignore `android/` and `ios/`)
- [ ] Remove the old `prototype/mobile/proto` folder once nothing references it
      — Nothing references it. **Not deleted yet** (`git rm -r prototype/mobile/proto`).
- [ ] Run `docs/user-app-testing.md` on a real phone and fix what it finds

Fixed along the way (were listed under Done but did not work): the pickup OTP was never shown
in the app; the booking price was computed in the app rather than taken from the server quote;
a trip escalated by an SOS dropped the customer out of the live screen.

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

### To do
- [ ] Background location (expo-task-manager + foreground service on Android, `location`
      background mode on iOS) so tracking continues with the screen off or the app minimised
- [ ] Offline buffering: queue telemetry frames locally and replay them on reconnect
- [ ] Push notifications for new trip offers (today offers are polled), with sound and
      vibration; register the device
- [ ] Real map with navigation to pickup and drop (react-native-maps + open in Google Maps)
- [ ] Earnings screen: daily/weekly totals, trip-by-trip earnings, payout history and status
- [ ] Assessments in the app: show written test status and practical test schedule
- [ ] Post-trip inspection flow polish: block completion until all 8 photos upload; retry
      failed uploads
- [ ] Profile: documents with expiry reminders, badges, Night Shield status, score and rating
- [ ] Battery and data usage check during a 2-hour trip
- [ ] Follow-ups from the 24 Oct review of `bd0d854` and `52c609f` (details in `progress.md`):
      user app shows "Verified Chauffeur" / "ID Verified" when a car has no model or plate;
      hardcoded ₹19 platform-fee fallbacks in the driver Home and Trip summary screens (fees
      are console-editable since `cd9de9c`); decide whether drivers must enter their own
      vehicle and plate before going online
- [ ] User app follow-ups from `cd9de9c`: tier picker vs the server choosing the tier from the
      car (the website already does); settings for the new safety defaults (speed limit,
      share with guardians, female driver preference); tell the customer on the live screen
      when the driver has arrived
- [ ] App icons, splash screen, store listing text and screenshots
- [ ] EAS build profiles and production `.env`; internal TestFlight and Play testing builds

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
- [x] ~~342 backend tests passing~~

### Website: done
- [x] ~~Public site with a unified header, login-gated actions that return you to where you
      were, logo back to the public site~~
- [x] ~~"Join as a driver" with Coming-soon store links; no operator link on the customer site~~
- [x] ~~Booking with live place search, Garage and profile edit; fixed the pickup in the payload~~
- [x] ~~Phase toggles (bus, caravan, scheduled pickup, full-time off; data kept)~~
- [x] ~~Live prices on the marketing pages from rate cards~~

### Operations console: done
- [x] ~~Separate build and subdomain (admin.mydriver.in), origin checks, optional IP allowlist~~
- [x] ~~Overview, live board, trips, customers, drivers with filters, check-ins, Night Shield,
      grading, payments, payouts, pricing, audit ledger~~
- [x] ~~Live map with demo drivers; plates only for drivers on a trip~~
- [x] ~~Click a driver on the map: live trip details and the driver's earnings, trips,
      escalations, SOS and warnings; same section on the driver profile~~

### Infrastructure: done
- [x] ~~Dockerfiles, `deploy/docker-compose.prod.yml`, Caddy auto-TLS, `.env.production.example`~~
- [x] ~~GitHub Actions CI (backend tests, website lint and builds)~~
- [x] ~~Merge `main` and `validation` into `production-p1`~~

### Done 12 Oct 2026 (not yet committed)
- [x] ~~Console plate during a trip: the customer's car from the booking (the car being
      driven), falling back to the driver's profile plate~~
- [x] ~~Console live map and live board over WebSocket (`SUBSCRIBE_OPS`; 60 s backstop poll,
      4/10 s polling while the feed is down)~~
- [x] ~~Review Umesh's backend changes. Fixed: FCM calls had no timeout and run inside trip
      transitions. Left as is: `minio` image unpinned (`latest`), and FCM deletes a token on
      any `INVALID_ARGUMENT` (an iOS APNs token is deleted on its first send)~~
- [x] ~~Charge an amount due: a second order from the same checkout page, captured on payment,
      idempotent across checkout callback and webhook (migration `0018`)~~
- [x] ~~"Driver arrived": set when the driver's position is within 150 m of the pickup during
      `HANDSHAKE_PENDING`; WebSocket frame `DRIVER_ARRIVED` and a customer push~~
- [x] ~~Trip API returns `started_at` and `arrived_at`; the driver app's timer uses `started_at`~~
- [x] ~~Practical test date: `assessment_attempts.scheduled_at`, set from the console driver
      page; shown in the driver app's Tests tab and the grading queue~~
- [x] ~~`[BOOK-01]` made deterministic; a cancel that races dispatch now retries once~~

### To do
- [ ] Send push notifications from the backend for offers and trip events (FCM/APNs keys)
      — Code reviewed. Still to do: the FCM service account on the server with
      `PUSH_PROVIDER=fcm`, and iOS (FCM cannot use the raw APNs token the apps register).
- [ ] Amount due against Razorpay test mode (only the mock provider has been run)
- [ ] Offer poll load (raised by Umesh, 24 Oct): `listPendingOffers` now runs
      `requireApprovedDriver` (a Postgres query) before the Redis offer hint, so every 2.5 s
      poll from every online driver hits the database again, which the polling fixes had removed.
      Checking approval only when the hint says an offer may exist would keep the fix
      (accepting an offer checks approval anyway)
- [ ] Firebase project with Android apps for `com.mydriver.driver` and `com.mydriver.user`
      (each with `.preview` and `.dev`); send `google-services.json` for both apps
- [ ] Maps SDK for Android key that allows those six package names
- [ ] Switch providers from mock/console to live: Razorpay, Cashfree, SMS (Twilio/MSG91),
      voice (Exotel/Twilio), liveness, Google Maps, S3; store keys in the server secrets
- [ ] Safety Desk one-click call and SMS to driver, customer and guardians, end to end with
      the live voice/SMS provider
- [ ] Email receipts after a trip
- [ ] Automated driver payouts (RazorpayX or bank file) instead of a manually entered UTR
- [ ] Production deploy: server, DNS for mydriver.in, api. and admin., TLS, run migrations,
      create staff accounts, `ADMIN_DEMO_DATA=hide`
- [ ] Backups (Postgres PITR, S3 versioning), uptime and error monitoring, log retention
- [ ] Load test dispatch and the telemetry WebSocket at the pilot's expected peak
- [ ] Merge `production-p1` into `main` (PR #1) once CI is green
- [ ] Replace the "Coming soon" store links on the website when both apps are published
- [ ] Phase 2: full-time contracts, bus, caravan, scheduled pickup (switch the toggles on and
      test), corporate accounts, evidence release to law enforcement

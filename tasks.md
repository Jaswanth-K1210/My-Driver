# MyDriver: Tasks

Owners: **Sanath** (user app) · **Umesh** (driver app) · **Jaswanth** (backend, website,
operations console, infrastructure).

Completed tasks are ~~struck through~~. Status as of 11 Oct 2026, branch `production-p1`.
Sanath's and Jaswanth's to-do lists were annotated by Umesh on 11 Oct 2026 with work he did in
their areas; that work is pushed to `production-p1` but unreviewed.

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
      — **Written**, app and backend, except "driver arrived" (the backend has no arrival
      event). Needs `google-services.json` and a phone check.
- [ ] Silent SOS on triple volume-button press
      — **Written**, behind a switch in Profile, off by default. Works only with the trip
      screen open. Adds the native module `react-native-volume-manager`, not yet built.
- [ ] Garage management in Profile: add, edit, delete and set a default car
      — **Written.** Needs a phone check.
- [ ] Pay an outstanding amount due after a trip that ran over its hold
      — **Not built.** The amount is shown on the completion screen and the receipt. Charging
      it needs backend payment work (see Jaswanth's list).
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

### To do
- [ ] Decide which plate the console shows during a trip: the customer's car (being driven)
      or the driver's profile plate
- [ ] Console live map and live board over WebSocket instead of 4 s polling
- [ ] Send push notifications from the backend for offers and trip events (FCM/APNs keys)
      — Offer pushes (driver) and trip-event pushes (customer) are **written by Umesh, pushed,
      not reviewed**. Still to do: the FCM service account on the server with
      `PUSH_PROVIDER=fcm`, and iOS (FCM cannot use the raw APNs token the apps register).
- [ ] Review Umesh's pushed backend changes (list in `progress.md`): polling fixes,
      telemetry accepted during `ESCALATED`, `src/modules/driver-app/` (earnings, assessments,
      profile), `DELETE /v1/me/devices`, `trips/customer-push.ts`, the MinIO image swap in the
      dev compose file, and the additive methods in `prototype/shared/api-client.js`
- [ ] Firebase project with Android apps for `com.mydriver.driver` and `com.mydriver.user`
      (each with `.preview` and `.dev`); send `google-services.json` for both apps
- [ ] Maps SDK for Android key that allows those six package names
- [ ] Charge an amount due: `captureForTrip` records `amount_due` when the final fare is above
      the hold but nothing collects it. Needs a second order, a migration, and changes to the
      checkout page, verify route and webhook. The user app shows the amount and waits on this.
- [ ] "Driver arrived" event, if the customer should be notified of it (no such state today)
- [ ] Return the trip's start time in the trip API (the driver app's timer counts from when
      tracking began on the phone instead)
- [ ] A database field for the practical test date (the driver app's Tests tab cannot show one)
- [ ] Smoke test `[BOOK-01]` depends on timing: it cancels without waiting for dispatch, and
      failed once in two full runs. Probably needs `awaitDispatchIdle()`.
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

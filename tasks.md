# MyDriver: Tasks

Owners: **Sanath** (user app) · **Umesh** (driver app) · **Jaswanth** (backend, website,
operations console, infrastructure).

Completed tasks are ~~struck through~~. Status as of 10 Oct 2026, branch `production-p1`.

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
- [ ] Driver tier picker: read tiers and prices from the live rate cards (`useTrip().skills`)
      instead of `data/mock` `SKILLS`, so console price changes show in the app
- [ ] Real map on the live trip and matching screens (react-native-maps), replacing `MapCanvas`
- [ ] Push notifications: register the device (`api.devices.register`) and handle driver
      matched, driver arrived, trip started/ended, and payment due
- [ ] Silent SOS on triple volume-button press (the toggle in Profile does not do anything yet)
- [ ] Garage management in Profile: add, edit, delete and set a default car
- [ ] Pay an outstanding amount due after a trip that ran over its hold
- [ ] Trip history list with receipts (and email a receipt once the backend supports it)
- [ ] Empty, error and offline states on every screen; retry when the network drops mid-trip
- [ ] Accessibility pass (labels, font scaling, contrast) and small-screen layout check
- [ ] App icons, splash screen, store listing text and screenshots
- [ ] EAS build profiles and production `.env`; internal TestFlight and Play testing builds
- [ ] Remove the old `prototype/mobile/proto` folder once nothing references it

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

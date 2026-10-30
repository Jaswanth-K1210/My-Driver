# MyDriver: Testing plan

How the three of us test the whole product (backend, website, console, customer app, driver app)
before the 15 Nov handover. It sits under the phase plan in [`prd.md`](../prd.md) Part 5 and does not
change it: Phases 4 and 5 are where this runs.

Agreed on 30 Oct: Sanath's last three fixes land first, then testing layers 1 to 3, then Sentry.

## 1. Order of work

| Step | What | Owner | Starts when |
|---|---|---|---|
| 1 | Close CR-7, CR-8, CR-10 in the user app | Sanath | Now |
| 2 | Layer 1: automated checks green in CI, driver-app tests added to CI | Jaswanth | After step 1 |
| 3 | Layer 2: Playwright end-to-end tests for the website and console | Jaswanth | After step 1 |
| 4 | Layer 3: Maestro end-to-end flows for both apps | Sanath (user app), Umesh (driver app) | Once Android development builds exist |
| 5 | Observability: Sentry on all surfaces, log viewer on staging | Each owner for their area | After step 1 |
| 6 | Layer 4: manual suites on real phones, joint rides | All three | Phase 4 (desk), Phase 5 (road) |

Start the slow accounts now, in parallel with all of this: **X-1 Apple Developer** (iPhone testing
waits on it), **X-2 EAS**, and **X-5 staging server** (road tests wait on it).

## 2. Which build to test on

Expo Go cannot test the product: maps, push, background location, volume-button SOS and the driver
offer ring are native modules that Expo Go does not contain.

| Build | What it is | Use it for |
|---|---|---|
| Expo Go | Expo's own app loading our JavaScript | Quick screen checks only. Never for test results. |
| **Development build** | Our app with our native modules, loading JavaScript live from a laptop | **Phase 4.** Debugging at a desk: instant reloads, logs, debugger. |
| **Preview build** (Android APK, iOS TestFlight) | Standalone app, close to the release build, no laptop needed | **Phase 5.** Every test whose result counts: road tests, background, locked screen, network loss. |

- JavaScript-only fixes reach preview builds through **EAS Update**, without a rebuild. A native
  change (new module, permission, app config) needs a new build.
- **Android** can start now. Without the EAS account an APK can be built locally with
  `npx expo run:android` or `eas build --local` (needs the Android SDK).
- **iPhone** needs the paid Apple Developer account (X-1, US$99 a year) for anything on a real
  device. See section 8.

## 3. Where the backend runs

| Stage | Backend | How phones reach it | Good for |
|---|---|---|---|
| Phase 4, at a desk | A laptop: `npm run infra:up`, `db:migrate`, `seed:demo`, `dev` in `prototype/backend` | Same Wi-Fi, `EXPO_PUBLIC_API_URL=http://<laptop LAN IP>:4000` | Development builds, first joint ride |
| Stopgap | The same laptop | `cloudflared tunnel --url http://localhost:4000` gives a temporary public HTTPS address (WebSockets work) | A one-day trial on mobile data. The laptop must stay on; the address changes on restart. |
| **Phase 5, on the road** | **Staging server** | Public HTTPS on sslip.io hostnames until the domain exists (`deploy/README.md`, Staging) | All road tests, background and offline tests, the battery test |

Staging runs with the mock providers until the accounts exist: the OTP is printed in the API log,
payments use the mock checkout, KYC accepts the test PAN and a fixed Aadhaar OTP, push is logged.
Switch each provider to its real test account as soon as it is available, and before the
Phase 6 dry run.

## 4. Layer 1: automated checks (exists)

| Area | Command | Runs in CI |
|---|---|---|
| Backend | `npm run typecheck`, `npm test` (36 files, 411 tests on 30 Oct; needs Docker) | Yes |
| Website and console | `npm run lint`, `npm run build`, `npm run build:admin`, `npm run check` | Yes |
| Driver app | `npm test`, `npx expo export --platform android` | Yes (since 30 Oct) |
| Customer app | `npx expo export --platform android` (no test script) | Yes (since 30 Oct) |

CI runs on every push to `production-p1`, `main` and `validation`, and on pull requests.

Rule: CI is green before any build goes to testers.

## 5. Layer 2: website and console end-to-end (Playwright)

Owned by Jaswanth, in `prototype/website/e2e/`. It drives the real site and console in Chromium
against a real API (development mode, mock providers), and runs in CI (`e2e` job) on every push.

**Run it locally** (about a minute):

```bash
cd prototype/backend && npm run infra:up && npm run db:migrate && npm run db:seed
cd ../website && npx playwright install chromium   # once
npm run e2e                                        # stop your own API on :4000 first
```

Playwright starts the API itself so it can read OTPs from its log (`e2e/.api.log`), creates one
console account per staff role (`e2e/.staff.json`, gitignored), and resets the local Redis login
counters before each sign-in instead of loosening the limits in the backend. On failure:
`npx playwright show-report`, and in CI the `playwright-report` artifact.

| # | Flow | File |
|---|---|---|
| 1 | Customer signs in with the OTP from the SMS; booking with no driver online ends in "no driver" and releases the hold | `customer.spec.js` |
| 2 | Book, pay through the mock checkout; Track follows matched, arrived, pickup OTP read off the screen, in trip, complete; rating saved | `customer.spec.js` |
| 3 | Final fare above the hold shows **Pay ₹X**; paying it through checkout removes the box | `customer.spec.js` |
| 4 | Cancel before arrival is free (hold released); after arrival the arrival fee is captured | `customer.spec.js` |
| 5 | Safety defaults from the first booking are saved; a failed save still books | `customer.spec.js` |
| 6 | Staff sign in through the console, the trip shows on the Board, trip detail opens | `console.spec.js` |
| 7 | Pricing: empty, negative, zero and too-high rates block Save; a valid change is saved and audited | `console.spec.js` |
| 8 | Safety Desk: SOS on the Board, acknowledge, resolve; the trip goes back to in trip and Track follows | `console.spec.js` |
| 9 | Suspending a driver: a pending offer goes to another driver; an accepted trip is cancelled free. Approval stays blocked until identity checks are done | `console.spec.js` |
| 10 | Roles: customer, finance, desk and ops tokens refused where they should be; staff login refused from the customer site; desk nav has no Pricing or Audit | `console.spec.js` |

The driver's side runs through the API (`onlineDriver` in `e2e/helpers.js`); the driver app itself
is covered by layer 3. Tests that change prices (3, 7) restore them in a `finally`.

## 6. Layer 3: mobile end-to-end (Maestro)

New. Maestro flows are short YAML files that drive a real build on an emulator or phone. Only the
critical paths are scripted; the rest stays manual. Flows live in each app's `e2e/` folder.

| App | Flows | Owner |
|---|---|---|
| Customer | Sign in · book within city · see driver matched and arrived · share pickup OTP · complete and rate · cancel | Sanath |
| Driver | Sign in · onboarding status · go online · receive and accept offer · pickup OTP · inspection photos · complete | Umesh |

Run on an Android emulator against the desk backend first, then on preview builds against staging.

## 7. Layer 4: manual testing on real phones

The main event, in Phase 5. The suites already exist:
[`user-app-testing.md`](user-app-testing.md) (11 suites, Sanath) and
[`driver-app-testing.md`](driver-app-testing.md) (14 suites, Umesh).

**Run every scenario as a joint ride:** one person on the customer app, one on the driver app, one
on the console. Most bugs in this product sit between surfaces.

Angles to cover, recorded as scenario × platform × result in the shared bug log (`prd.md` §3.5):

- **Every trip state and every exit:** cancelled by customer, driver or ops at each stage; no driver
  found; offer expired; two missed offers (auto-offline); driver loses approval; SOS raised and
  resolved; amount due paid.
- **Roles:** customer, driver, Safety Desk agent, ops manager, finance, super admin, including each
  trying what it must not be allowed to do.
- **Devices:** one low-end Android, one recent Android, one iPhone.
- **Networks and app state:** Wi-Fi, 4G, airplane mode in the middle of a trip, app killed in the
  middle of a trip, screen locked for 10 minutes.
- **Hyderabad routes:** within city, RGIA airport, multi-stop, outstation round trip.
- **Non-functional:** the 2-hour battery and data test (one Android, one iPhone); TalkBack and
  VoiceOver; large font; small screen.

Each bug: surface, platform and phone, steps, severity (P0, P1, P2), owner, and the trip ID, so it
can be traced in the logs (section 9).

## 8. iPhone

1. **Now:** Sanath starts X-1 (organisation enrolment needs a D-U-N-S number and can take days).
2. **Phase 4:** register each tester's iPhone with `eas device:create`, then
   `eas build --profile development --platform ios`. The install link works on registered phones only.
3. **Phase 5:** preview builds through **TestFlight internal testing** (up to 100 team members, no
   Apple review).
4. **After launch:** TestFlight external testing for drivers. One Beta App Review, usually under
   48 hours; submit by the end of Phase 5.

Until X-1 is approved: the iOS simulator on a Mac for screens and flows (no real push, GPS movement or
volume buttons); Expo Go for screens with no native modules. A free Apple ID can install on one's own
iPhone for 7 days but without push, so it cannot test the offer ring. If X-1 is still pending when
Phase 5 starts, iOS becomes a Phase 5 day-1 item, as `prd.md` allows.

Staging needs `APNS_PRODUCTION=false` and the `.dev` bundle IDs in `APNS_TOPICS` for development
builds, and `true` with the release IDs for TestFlight.

## 9. Logs and observability

### What already records everything (backend)

| What | Where |
|---|---|
| Every request, error and timing (tokens, OTPs and signatures redacted) | JSON logs on the API's stdout |
| Every trip state change and why | `trip_events` table |
| Every payment hold, capture, release and webhook | `payment_events` table |
| Every incident step | `escalation_events` table (append-only) |
| Every staff action in the console | `audit_log` table (append-only) |
| Every GPS fix and speed reading | `telematics_logs` (TimescaleDB) |
| Request rates, errors, escalations | `/metrics` (Prometheus) |

With the trip ID from a bug report, the event tables replay what the server saw.

### Gaps and what we add

1. **Searchable logs on staging (Jaswanth).** Today the logs sit in Docker's rotating files (5 × 20 MB)
   and can only be grepped. Add **Grafana Loki and Grafana** as containers on staging (free,
   self-hosted), or a hosted service such as Better Stack or Axiom. Search by trip ID or user ID.
2. **Sentry for errors and crashes (all three, after step 1).** Not a log of everything: crashes,
   errors and slow requests, each with device, OS, build, screen and the steps before it.
   - Backend `@sentry/node` and website `@sentry/react`: Jaswanth. Apps `@sentry/react-native` (Expo
     config plugin; works in development and preview builds, not Expo Go): Sanath and Umesh.
   - Tag every event with `environment` (`local`, `staging`), the build or release, and the tester,
     so the daily triage can filter one test session.
   - **Privacy, before it is switched on:** this is a safety product. Scrub phone numbers, PAN and
     Aadhaar digits, OTPs, auth headers and exact coordinates in `beforeSend`; never send telemetry
     payloads. Sample performance traces at 10 to 20 percent.
   - Upload source maps from EAS builds so app stack traces are readable.
   - **Error budget: the free tier allows 5,000 errors a month** for the whole organisation, so the
     API, website and both apps share it (about 165 a day). One looping bug could use it up in an
     hour, so give each project's DSN a daily rate limit in Sentry (Project Settings > Client Keys >
     Rate limit) and keep spike protection on: API 50, website 25, customer app 40, driver app 40 a
     day (155 a day, about 4,650 a month). Once a project hits its limit, its errors are dropped until
     the next day, so triage that day's issues first. Traces have their own quota, separate from errors.

## 10. Daily routine in Phase 5

1. Morning: CI green; staging redeployed with yesterday's fixes; testers on the latest preview build or EAS Update.
2. Road tests as joint rides; every bug logged with its trip ID.
3. Evening triage, all three: Sentry issues and the bug log, P0 and P1 assigned for the same day.
4. Fixes follow `AGENTS.md`: commit with the bug ID, `progress.md` entry, redeploy.

Gate 5 (`prd.md`): every suite passes on Android and iOS, no open P0 or P1 bugs, a joint ride passes
on both platforms, battery results recorded.

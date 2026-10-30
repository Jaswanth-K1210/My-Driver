# MyDriver: Test results

A log of test runs, newest first. What each layer is and how to run it is in
[`testing-plan.md`](testing-plan.md). Manual results on phones (layer 4) go in the bug log
(`prd.md` §3.5) and in the app testing guides.

## 2026-10-30 · Jaswanth · Website load performance

**Change:** the first download no longer carries Sentry or Leaflet. Customer site, production build
(`vite preview`), Playwright on a Pixel 7 profile with Lighthouse's slow-4G throttling (150 ms RTT,
1.6 Mbps) and a 4x slower CPU, cold cache, three runs each.

| | Before | After |
|---|---|---|
| Main JavaScript | 1,025 kB (317 kB gzip) | 414 kB (119 kB gzip) |
| LCP (hero text) | 3.17–3.26 s | 2.00–2.08 s |
| Total blocking time (long tasks) | 539–632 ms | 353–385 ms |
| CLS | 0 | 0 |

With Sentry off, its chunk is never requested; with a DSN set it loads after the app (158 kB, 54 kB
gzip, down from 450 kB) and still sends scrubbed errors and spans (checked against a local fake Sentry).
Leaflet (149 kB) now loads only on Track, the guardian page and the first "Choose on map".

| Check | Result |
|---|---|
| CI lint command on `src` | Pass |
| `npm run check`, `npm run build`, `npm run build:admin` | Pass |
| `npm run e2e` | **15 / 15 passed** (new test 11: "Choose on map") |

Not measured: INP (needs real interaction), and the console build beyond its size (278 kB main).

## 2026-10-30 · Jaswanth · Sentry (backend and website)

**Change:** Sentry in the API and the website/console, with the privacy filter (`testing-plan.md` §9).

| Check | Result |
|---|---|
| Backend `npm run typecheck` | Pass |
| Backend `npm test` | **422 / 422 passed**, 37 files (11 new: `tests/unit/sentry-scrub.test.ts`) |
| Backend `npm run build`, then `npm start` (`node --import ./dist/instrument.js`) | `/health` ok |
| Website `npm run lint` | 0 errors, no new warnings |
| Website `npm run check` | Pass (now also `scripts/check-sentry-scrub.mjs`) |
| Website `npm run build`, `npm run build:admin` | Pass |
| Website `npm run e2e` (Sentry off) | Run 1: **13 / 14**, 9b failed. Runs 2 and 3: **14 / 14** |
| API against a local fake Sentry | Error event and spans received, tagged `environment` and `release`; a planted phone number, PAN, OTP, coordinates, bearer token, cookie and query string all arrived as `[redacted]` or not at all |
| Website against a local fake Sentry | Same result for a thrown browser error and page-load spans; tagged `app: website` |

**Open:** the one failure in 9b ("suspending a driver on the way to pickup cancels the trip")
came right after the backend suite had run against the same local Postgres and Redis. Two clean
reruns followed. Cause not confirmed; watch it in CI.

## 2026-10-30 · Jaswanth · Layers 1 and 2

**Commit:** `f93c26c` on `production-p1`. **CI run:** GitHub Actions #40956914501, every job green.

### Layer 1: automated checks (CI)

| Area | Check | Result |
|---|---|---|
| Backend | `npm run typecheck`, `npm run build` | Pass |
| Backend | `npm test` (vitest, Postgres and Redis in CI) | **411 / 411 passed**, 36 files |
| Website and console | oxlint `--deny-warnings` on `src`, `npm run check`, `npm run build`, `npm run build:admin`, bundle separation | Pass |
| Driver app | `npm test` | **26 / 26 passed** |
| Driver app | `npx expo export --platform android` | Pass |
| Customer app | `npx expo export --platform android` | Pass |
| Docker images | API, website, console images build | Pass |

New today: CI now runs on `production-p1` (it ran only on `main` and `validation` before, so
nothing on our branch was checked), and the `mobile` job checks both apps.

Found by the first run on our branch: a lint error in `src/components/app/MapPickerModal.jsx` (a ref
written during render, from `cd9de9c`). Fixed in `1b4e4c7`.

### Layer 2: website and console end-to-end (Playwright)

Chromium against a real API in development mode with mock providers (SMS, payments, KYC,
liveness, maps). The driver side is simulated through the API. Run locally three times in a row,
then in CI: **14 / 14 passed** every time, about 1 minute.

| # | Test | CI time |
|---|---|---|
| 1 | A customer signs in with the OTP from the SMS | 0.9 s |
| 1b | Booking with no driver online ends in "no driver" and releases the hold | 1.9 s |
| 2 | The Track page follows the trip from matched to arrived, pickup OTP, in trip and complete; the rating is saved | 6.2 s |
| 3 | A fare above the hold shows "Pay ₹X", which goes once paid | 6.3 s |
| 4a | Cancelling before the driver arrives is free (hold released) | 2.7 s |
| 4b | Cancelling after the driver arrives charges the arrival fee | 6.2 s |
| 5a | Safety defaults chosen on the first booking are saved | 2.5 s |
| 5b | A failed safety-defaults save still books the trip | 1.7 s |
| 6 | Staff sign in, see the trip on the Board and open it | 7.6 s |
| 7 | Pricing blocks invalid rates (empty, -1, 0, 501) and audits a valid change | 2.5 s |
| 8 | Safety Desk acknowledges and resolves an SOS; the trip goes back to in trip | 5.2 s |
| 9a | Suspending a driver with a pending offer hands the trip to another driver | 5.4 s |
| 9b | Suspending a driver on the way to pickup cancels the trip at no charge | 4.3 s |
| 10 | Each role is refused where it does not belong (API and console navigation) | 1.7 s |

**Product bugs found: none.**

Notes from writing the tests (the product works as designed in each case):

- The API allows 10 OTPs per network an hour and 5 staff logins per account in 15 minutes. A test
  run hits both from one machine, so the suite resets the counters in the local Redis; the limits
  themselves are unchanged.
- Once a driver has accepted, suspending them cancels the trip with no fee instead of re-dispatching
  it (CR-2). Before acceptance the trip goes to the next driver. Both are tested.
- A development driver cannot be re-approved from the console until PAN, Aadhaar and licence are
  done; test 9a checks the block is shown.
- The customer's rating does not appear on the trip response, only in the driver's average.

### Not run yet

| Layer | Status |
|---|---|
| 3: Maestro, both apps | Requested from Sanath and Umesh (`tasks.md`); needs Android development builds |
| 4: manual suites on phones | Phase 4 (desk) and Phase 5 (road) |

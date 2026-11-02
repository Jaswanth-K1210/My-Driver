# Deploying MyDriver (API + website)

One Docker host runs everything: Caddy (automatic HTTPS), the API, the
customer website, the operations console, Postgres/TimescaleDB, PgBouncer and
Redis. Photos and documents go to external
S3. Only ports 80 and 443 are published.

## Before the first deploy

You need accounts and keys for each of these. The API **refuses to start** in
production while any required one is missing or left at a development value,
and prints exactly what is wrong.

| Needed for | Service | Variables |
|---|---|---|
| OTP sign-in, desk calls | Twilio | `TWILIO_*` |
| PAN and Aadhaar checks | Cashfree Verification Suite | `CASHFREE_*` |
| Payments | Razorpay (test keys are fine for staging) | `RAZORPAY_*` |
| Place search | Google Maps Platform, Places API (New) | `GOOGLE_MAPS_API_KEY` |
| Photos, documents, certificates | S3 bucket (private) | `STORAGE_*` |
| Push to Android (optional) | Firebase Cloud Messaging | `FCM_SERVICE_ACCOUNT_JSON` |
| Push to iPhones (optional) | Apple Developer > Keys, an APNs `.p8` key | `APNS_*` |

DNS: point `WEB_DOMAIN`, `ADMIN_DOMAIN` and `API_DOMAIN` (A/AAAA records) at
the host before starting, so Caddy can obtain certificates.

## Two sites, kept apart

| Site | Domain | Build |
|---|---|---|
| Customer website | `WEB_DOMAIN` (mydriver.in) | `VITE_APP_TARGET=customer` |
| Operations console | `ADMIN_DOMAIN` (admin.mydriver.in) | `VITE_APP_TARGET=admin` |

- **Separate bundles.** The customer site contains none of the console's code
  and has no route to it; `/admin` there is just an unknown page. CI fails if
  either bundle picks up the other's pages.
- **Separate sessions.** Browsers keep sign-ins per domain, so a customer
  session and a staff session never mix.
- **API origin checks.** Browser staff sign-in is accepted only from
  `ADMIN_WEB_URL`; `/v1/admin/*` refuses calls from the customer site. Role
  checks apply on top. The API will not start if the console shares the
  customer domain or is missing from `CORS_ORIGINS`.
- **Not indexed.** The console sends `X-Robots-Tag: noindex, nofollow`.
- **Optional network lock.** Set `ADMIN_ALLOWED_IPS` (space-separated CIDRs,
  e.g. your office and VPN) and everyone else gets a 404 from Caddy.
- **Keep it unlisted.** Share the console address only with staff (bookmark,
  password manager, internal wiki); nothing public links to it.

## First deploy

```bash
cd deploy
cp .env.production.example .env.production   # fill in every value
# secrets:  openssl rand -hex 32

docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres pgbouncer redis
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm api node dist/db/migrate.js
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm api node dist/db/seed.js
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Then:

1. **Razorpay webhook.** Dashboard → Webhooks → `https://<API_DOMAIN>/v1/payments/webhook`,
   events `payment.authorized` and `payment.failed`, secret = `RAZORPAY_WEBHOOK_SECRET`.
2. **Staff accounts.** There is no staff sign-up. Create each person's account
   from the host; the one-time password prints to your terminal only:
   `docker compose -f docker-compose.prod.yml --env-file .env.production run --rm api node dist/db/create-staff.js you@company.in SUPER_ADMIN "Your Name"`
   Roles: `SUPER_ADMIN`, `OPS_MANAGER`, `SAFETY_DESK_AGENT`, `FINANCE`.
   Running it again for the same email resets that password.
3. **Smoke check.** `https://<API_DOMAIN>/ready` returns `{"status":"ready"}`
   the website loads at `https://<WEB_DOMAIN>`, and the console sign-in loads
   at `https://<ADMIN_DOMAIN>/login`.

## Staging (Phase 3–5 testing)

Staging is the same stack and the same steps as above, with test keys. It runs with
`NODE_ENV=production`, so the start-up guard still applies: SMS, KYC and payments must be real
providers, but **test or sandbox** accounts are enough.

| Variable | Staging value |
|---|---|
| `WEB_DOMAIN` / `API_DOMAIN` / `ADMIN_DOMAIN` | Staging subdomains, e.g. `staging.mydriver.in`, `api.staging.mydriver.in`, `admin.staging.mydriver.in`. DNS first, then start Caddy. |
| `RAZORPAY_*` | Test-mode keys (`rzp_test_…`) and a test-mode webhook pointing at the staging API |
| `CASHFREE_*` | Sandbox credentials, with `CASHFREE_BASE_URL` set to Cashfree's sandbox verification URL |
| Demo data | Nothing to set: with `NODE_ENV=production` the console never shows the demo drivers and trips |
| `APNS_PRODUCTION` | `false` while testers use development builds; `true` once they move to TestFlight |
| `APNS_TOPICS` | The builds testers actually run, e.g. `com.mydriver.user.dev,com.mydriver.driver.dev` (add the `.preview` IDs for preview builds) |
| `PLACE_SEARCH_BIAS` | Leave the Hyderabad default (`17.3850,78.4867`) |
| `SENTRY_ENVIRONMENT` | `staging` (see Monitoring) |

After the first deploy:

1. **Staff accounts** for the three developers (`create-staff.js`, above).
2. **Hyderabad prices (D-4).** Sign in to the staging console, open **Pricing**, and enter the agreed rate
   cards and fees. Every change is audited.
3. **Hand over to the app developers** (X-3, X-4). They need, for **each** app and variant:
   - the staging API URL, set as `EXPO_PUBLIC_API_URL` in their EAS profile;
   - `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from the Firebase project,
     as EAS file secrets, never committed;
   - the Maps SDK for Android key as `GOOGLE_MAPS_API_KEY_ANDROID`, restricted to the package names
     and the EAS signing certificate (and an iOS key restricted to the bundle IDs).
4. **Smoke check** as above, then one booking from the website with a Razorpay test card.

Redeploy (see Updating) whenever fixes land on `production-p1`.

## Updating

```bash
git pull
export RELEASE=2026.10.1             # tag the images
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm api node dist/db/migrate.js
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Migrations only ever add (new tables, columns, indexes), so they are safe to
run before the new API starts. On shutdown the API stops taking traffic,
finishes in-flight requests and flushes buffered telemetry, so restarts do not
drop trips.

`seed.js` creates the rate cards, assessments and badges on first run.
Re-running it is safe: it never overwrites prices. Change prices in the
console's **Pricing** page (Finance or super admin); every change is audited.

**Rollback:** set `RELEASE` back to the previous tag and `up -d` again. The
previous API runs fine on the newer schema.

## Backups

Postgres holds everything durable (Redis can be lost without losing data).
Take a nightly dump off the host, for example from cron:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "mydriver-$(date +%F).dump"
```

Restore with `pg_restore -d mydriver --clean`. Test a restore before launch.
The `audit_log` and `trip_events` tables are append-only by design: never
truncate them in production.

## Monitoring

- `GET /health`: process is up. `GET /ready`: database and Redis reachable
  (fails during shutdown so the proxy drains first).
- `GET /metrics`: Prometheus format, requires `Authorization: Bearer <METRICS_TOKEN>`.
- Logs are JSON on stdout (rotated by Docker, 5 × 20 MB per service). Tokens,
  OTPs and signatures are redacted before they are written.
- **Sentry** (errors, crashes, 10 % of traces): set `SENTRY_DSN` (API) and `VITE_SENTRY_DSN`
  (website and console, baked in at build time) in `.env.production`, plus `SENTRY_ENVIRONMENT`
  (`staging` or `production`). Events carry the `RELEASE` and, once someone signs in, a `tester`
  tag with their user ID. Before anything is sent, phone numbers, PAN, Aadhaar, OTPs, tokens,
  query strings and coordinates are removed and request bodies are dropped
  (`src/lib/sentry-scrub.*`). Empty DSNs leave Sentry off. The free tier allows 5,000 errors a
  month across all projects: set each DSN's daily rate limit as in `docs/testing-plan.md` §9.

## Known limits at launch

These do not block a launch but should be planned:

- **Face match** runs on the mock provider: the pickup selfie is captured and
  stored, but not compared to the driver's photo. The API warns at boot.
- **Single host.** The API is stateless (sessions in Postgres, live state in
  Redis), so it can scale out behind a load balancer later; Postgres and Redis
  would move to managed services at that point.
- **Overtime** above the payment hold is recorded as owed, not charged.

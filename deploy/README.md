# Deploying MyDriver (API + website)

One Docker host runs everything: Caddy (automatic HTTPS), the API, the website,
Postgres/TimescaleDB, PgBouncer and Redis. Photos and documents go to external
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
| Push notifications (optional) | Firebase Cloud Messaging | `FCM_SERVICE_ACCOUNT_JSON` |

DNS: point both `WEB_DOMAIN` and `API_DOMAIN` (A/AAAA records) at the host
before starting, so Caddy can obtain certificates.

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
   and the website loads at `https://<WEB_DOMAIN>`.

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

`seed.js` is the source of truth for rate cards, assessments and badges.
Re-running it **resets prices to the values in `src/db/seed.ts`**, so change
prices there, not by hand in the database.

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

## Known limits at launch

These do not block a launch but should be planned:

- **Face match** runs on the mock provider: the pickup selfie is captured and
  stored, but not compared to the driver's photo. The API warns at boot.
- **Single host.** The API is stateless (sessions in Postgres, live state in
  Redis), so it can scale out behind a load balancer later; Postgres and Redis
  would move to managed services at that point.
- **Overtime** above the payment hold is recorded as owed, not charged.

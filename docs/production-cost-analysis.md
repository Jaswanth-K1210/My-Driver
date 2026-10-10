# MyDriver production cost analysis

Written 2026-10-10 against the `production-p1` branch.

**Headline.** The data stores (PostgreSQL/TimescaleDB, Redis, S3) are the
cheapest part of going to production. None of them bills per query in the
deployment this repo ships; you pay for capacity. More than 90% of the monthly
bill is three per-call integrations (Razorpay, Google Places, Twilio SMS) plus
inspection-photo storage, and two of those are 10–30x dearer than they need to
be as currently built.

## How to read the numbers

- Vendor prices were checked on the web on 2026-10-10. Where only a secondary
  source was found, the figure is marked "approx". Confirm every rate on the
  vendor's own page or dashboard before budgeting.
- Exchange rate used: Rs 96 per USD (mid-September 2026).
- Hosting prices are AWS Mumbai (ap-south-1) on-demand list prices, before any
  savings plan.
- Query and command counts come from reading the code. Nothing here was
  measured on a production server. The repo's own load test
  (`prototype/backend/loadtest/README.md`) ran on a laptop and says it must be
  re-run on the deployment target.

### Assumptions (change these and the totals move)

| Assumption | Value | Why |
|---|---|---|
| Average fare | Rs 600 | Not in the repo; placeholder |
| Average trip length | 60 minutes | Placeholder |
| Place searches per booking | 6, half served from cache | 300 ms debounce, two or more location fields |
| SMS per trip | 1.2 | Login OTPs and guardian links, averaged |
| Photos per trip | 16 inspection photos + 1 selfie, about 40 MB | Pre and post inspection, 8 zones each. The server re-encodes at full resolution and quality 88. Size is an estimate; measure a real inspection before budgeting |
| Telemetry rate | 1 row per second per live trip | Driver app `timeInterval: 1000`. Neither customer app sends location today; the backend accepts it, and switching it on doubles telemetry rows |

Three scales are used throughout:

| Scale | Trips per day | Trips per month | Peak live trips (approx) |
|---|---|---|---|
| A, launch | 100 | 3,000 | 15 |
| B, growth | 1,000 | 30,000 | 150 |
| C, scale | 10,000 | 300,000 | 1,500 |

---

## Part 1. Integration costs (per call)

| Integration | When the code calls it | Price | Per trip, as built |
|---|---|---|---|
| Razorpay | Every paid booking: fare hold, then capture | 2% + 18% GST = 2.36% of fare | Rs 14.2 |
| Google Places Text Search | Each debounced keystroke in a location picker that misses the cache | $32 per 1,000 (Rs 3.07 each); first 5,000 a month free; $25.60 per 1,000 above 100,000 | about Rs 9 |
| Twilio SMS | Login OTP, guardian link, escalation alerts | $0.0832 per SMS (about Rs 8) | about Rs 9.6 |
| Twilio voice | Safety Desk calls only | $0.0496 per minute (about Rs 4.8) | near zero |
| Cashfree KYC | Once per person: PAN check + Aadhaar OTP | approx Rs 1–4 per check; public figures conflict | near zero |
| Firebase push | Driver offers, alerts | free | 0 |
| Face match | Mock provider, no vendor chosen | not yet a cost | 0 |

About Rs 33 per trip as built, roughly 5.5% of a Rs 600 fare, before hosting.

Fixed and one-time: Apple developer account $99 a year, Google Play $25 once,
Twilio Indian number about $1.15 a month, DLT sender registration if SMS moves
to an Indian route, the domain name. TLS is free through Caddy.

---

## Part 2. Database and storage costs

### 2.1 Does a database call cost money?

It depends entirely on the pricing model of where the store runs.

| Store | As deployed in this repo | Per-call charge? | What you actually pay for |
|---|---|---|---|
| PostgreSQL + TimescaleDB | Container on the Docker host | **No** | Server hours, disk GB, backups |
| Redis | Container on the Docker host | **No** | Server RAM |
| S3 | AWS S3, external | **Yes** | Per request, per GB stored, per GB downloaded |

So for Postgres and Redis a query has no price tag. Its cost is the share of
CPU, memory and disk it consumes, and it becomes money only when the load
forces a bigger server. Per-call billing appears only if you choose a
usage-priced managed service:

| Service | Billing model | Fit for MyDriver |
|---|---|---|
| Self-hosted on a VM (current) | Flat: VM + disk | Good at all three scales |
| Tiger Data (Timescale Cloud) | Compute by the hour, storage per GB-month; no per-query fee. Approx from $30/month compute, $0.18–0.21 per GB-month, tiered cold storage about $0.021 per GB-month | Good managed option; the only mainstream managed home for TimescaleDB |
| AWS RDS / Aurora | Instance hours; Aurora Standard also bills per million disk I/Os | **Not usable**: neither offers the TimescaleDB extension the schema requires |
| Upstash Redis | $0.20 per 100,000 commands | **Avoid**: see 2.4 |
| AWS ElastiCache | Node hours (us-east-1: t4g.micro about $9/month, t4g.small about $15, m7g.large about $74; Mumbai slightly higher) | Fine when Redis moves off the host |

### 2.2 What the backend asks of each store

Counted from the code, per unit of activity.

**Per live trip, every second (the hot path, `telemetry/ingest.ts`)**

| Store | Operations | Notes |
|---|---|---|
| Postgres | 0 direct | The row is buffered in memory |
| Redis | about 5 commands | `GET` trip roles, `SET` last position, `SET NX` geo throttle, `PUBLISH` to the customer's map, plus the integrity engine's 2 `GET`s every 3 s |

**Per live trip, per hour**

| Store | Operations |
|---|---|
| Postgres | 3,600 telemetry rows, written as batched multi-row `INSERT`s (flush at 100 rows or every 2 s); 720 `SELECT`s to refresh the 5-second trip-roles cache |
| Redis | about 18,000 commands; 360 `GEOADD`s (throttled to one per 10 s) |

**Per trip, whole lifecycle**

| Store | Operations |
|---|---|
| Postgres | Estimated 60–120 statements: booking, payment rows and events, offers, handshake, trip events, 16 inspection-photo rows, completion, certificate, rating. Estimate from reading the modules, not measured |
| Redis | Rate-limit counters (2–3 commands per limited request), WebSocket ticket, place-search cache reads and writes, rate-card cache |
| S3 | 17 `PUT`s (16 photos + selfie), plus the certificate. Signing a download URL is computed locally and makes no S3 call |

**Per online driver with no trip**

| Store | Operations |
|---|---|
| Postgres | The driver app polls for offers every 2.5 s: 1,440 requests an hour, each at least one query |

**Per ordinary HTTP request**: authentication is a JWT signature check, no
database or Redis call.

### 2.3 PostgreSQL + TimescaleDB

**Storage growth.** `telematics_logs` is the only table that grows fast. It is
compressed after 7 days and dropped after 90
(`migrations/0007_telematics.sql`). Sizes assume about 140 bytes per row
uncompressed including index, and about 10x compression.

| Scale | Rows per day | Steady-state telemetry | Peak write rate | Other tables, growth per month |
|---|---|---|---|---|
| A | 360,000 | under 1 GB | about 15 rows/s | about 30 MB |
| B | 3.6 million | about 8 GB | about 150 rows/s | about 300 MB |
| C | 36 million | about 80 GB | about 1,500 rows/s | about 3 GB |

"Other tables" is trips, events, payments, audit log at roughly 10 KB per
trip. `audit_log` and `trip_events` are append-only by design and grow
without limit.

**Storage cost per trip**: under one paisa. One trip-hour is about 0.5 MB for
a week and about 50 KB for the following 83 days, on disk priced at $0.0912
per GB-month.

**What you pay for**

| Cost type | Rate (Mumbai, on-demand) | Notes |
|---|---|---|
| Compute | t3.large $0.0896/h, m6i.xlarge $0.202/h, r6i.xlarge $0.26/h | The dominant database cost |
| Disk (gp3) | $0.0912 per GB-month | Includes 3,000 IOPS and 125 MB/s; more is billed separately |
| Backups | S3 or snapshot storage per GB-month | Nightly `pg_dump` per `deploy/README.md` |
| Network | Free inside one availability zone; cross-zone and internet egress are billed per GB | Keep API and database in the same zone |
| Per query | none | |

All three scales fit on a single Postgres server. Scale C's 1,500 rows per
second arrive as about 15 batched inserts per second.

**Ways to save**

1. **Stop polling for driver offers.** Offers are already pushed (FCM and the
   WebSocket). Dropping the 2.5-second poll removes the largest steady query
   load: 1,000 idle online drivers generate about 400 queries per second.
2. **Lengthen the trip-roles cache from 5 s to 60 s.** `broadcast.ts` already
   deletes the key on every status change, so the short TTL buys little. This
   cuts 720 lookups per trip-hour to 60.
3. **Sample location less often.** One fix every 2–3 seconds, or skipping
   fixes while stationary (`distanceInterval`), halves or thirds telemetry
   rows, Redis commands and phone battery use. Check the integrity engine's
   3-second pass and the speed-breach logic still behave before changing it.
4. **Compress after 1–2 days instead of 7.** The uncompressed set is the bulk
   of the disk; this shrinks it about 4x.
5. **Decide whether 90 days of raw telemetry is required.** If only disputes
   and certificates need it, 30 days cuts storage by two thirds.
6. **Archive, never truncate, the append-only tables.** After a year, export
   old partitions of `audit_log` and `trip_events` to S3 cold storage.
7. **Incremental backups at scale C.** A nightly full dump of 80 GB is slow
   and costly; move to WAL-based backups (pgBackRest or WAL-G) with a
   retention rule on the backup bucket.
8. **Buy capacity cheaper.** A one-year savings plan and ARM (Graviton)
   instances each take a meaningful slice off on-demand rates. The TimescaleDB
   image supports ARM.

### 2.4 Redis

**What it is used for** (all in the code today):

| Use | Where | Consequence if Redis is absent |
|---|---|---|
| Rate limits (OTP, KYC, place search) | `lib/rate-limit.ts` | OTP abuse turns directly into SMS spend |
| Driver geo index for dispatch | `modules/trips/geo-index.ts` | Matching cannot find nearby drivers |
| Live fan-out to the customer's map | `realtime/hub.ts` | No live tracking across API instances |
| Last known position for the integrity engine | `telemetry/ingest.ts` | Integrity and escalation checks blind |
| Place-search cache (24 h) | `modules/locations/service.ts` | Every search becomes a paid Google call |
| WebSocket tickets, trip-roles and rate-card caches | `realtime/ticket.ts`, others | Extra Postgres load, no socket sign-in |
| Readiness | `app.ts` | `/ready` fails, so the proxy sends no traffic |

**Memory needed.** Small. Live-trip and driver keys are a few hundred bytes
each and expire. The place-search cache is the largest consumer, at roughly
2–3 KB per distinct query.

| Scale | Estimated Redis memory |
|---|---|
| A | under 50 MB |
| B | under 150 MB |
| C | 0.5–1 GB, mostly place cache |

**What you pay for**: RAM on the host. No per-command charge when self-hosted.

**Why per-command pricing must be avoided.** One trip-hour is about 18,000
Redis commands. At Upstash's $0.20 per 100,000 that is about Rs 3.5 per
trip-hour: roughly Rs 10,000 a month at scale A, Rs 1 lakh at B and Rs 10
lakh at C, for a workload a Rs 1,500-a-month node handles.

**Ways to save**

1. **Self-host or use a fixed-price node**, never per-command billing.
2. **Set `maxmemory` with `volatile-lru`.** The production compose file sets
   neither; an unbounded place cache can exhaust host memory. `volatile-lru`
   evicts only expiring keys, so the driver geo index is never evicted.
3. **Pipeline the per-frame commands.** The three or four sequential round
   trips per telemetry frame can be one, which is CPU saved on both sides.
4. **Cache place results longer.** 24 hours is conservative; a longer TTL
   directly reduces Google Places spend. Check Google's caching terms for the
   permitted period first.

### 2.5 Should Redis be skipped until 1k or 10k users?

**No. Run it from day one, and keep it at every scale.**

- The backend cannot run without it: readiness, OTP rate limits, driver
  matching, live tracking and WebSocket sign-in all depend on it. Skipping it
  means rewriting those paths, not flipping a switch.
- At launch it costs nothing extra. It is a container on the same host using
  under 50 MB.
- It saves money from the first booking, through the place-search cache and
  the OTP rate limit.
- It becomes more necessary with scale, not less: once there is more than one
  API server, Redis is how they share live state.

What changes with scale is only where it runs:

| Scale | Redis placement |
|---|---|
| A and B | Same Docker host as today |
| C, or as soon as there are two API servers | Its own small node (self-hosted VM or ElastiCache), with a replica if dispatch downtime is unacceptable |

### 2.6 S3 object storage

This is the one store that genuinely bills per call.

| Cost type | Rate (approx list price) | Per trip |
|---|---|---|
| Upload requests (`PUT`) | about $0.005 per 1,000 | 17 PUTs = under Rs 0.01 |
| Download requests (`GET`) | about $0.0004 per 1,000 | negligible |
| Storage, Standard | about $0.025 per GB-month (approx Rs 2.1–2.4) | 40 MB = about Rs 0.10 per month, every month, forever |
| Data transfer out | first 100 GB a month free, then approx Rs 8–9 per GB | Viewing one full inspection set (40 MB) = about Rs 0.35 |
| Signing a download URL | free | Computed locally |
| Encryption at rest (SSE-S3) | free | |

Request charges are trivial. **Stored bytes are the cost**, and they
accumulate because nothing deletes or archives photos.

| Scale | Added per month | Stored after 12 months | Monthly bill at month 12 |
|---|---|---|---|
| A | 120 GB | 1.4 TB | about Rs 3,500 |
| B | 1.2 TB | 14.4 TB | about Rs 35,000 |
| C | 12 TB | 144 TB | about Rs 3.5 lakh |

At scale B and above, photo storage costs more than the database server.

Everything else kept in S3 is small next to inspection photos. Sizes here are
assumptions.

| Other objects | Assumed size | A | B | C |
|---|---|---|---|---|
| Trip certificates (PDF) | 100 KB per trip | 0.3 GB a month | 3 GB a month | 30 GB a month |
| Driver KYC documents | 10 MB per driver, once | about 1 GB | about 10 GB | about 100 GB |
| Database backups (7 daily + 4 weekly dumps) | 11 copies of the database | 22 GB, about Rs 50 a month | 110 GB, about Rs 260 a month | 1.3 TB, about Rs 3,200 a month |

Certificates and KYC documents together stay under 1% of photo storage. KYC
documents are the most sensitive objects in the bucket; keep them in India and
expire them after offboarding.

**Ways to save**

1. **Resize before storing.** Downscaling to about 1600 px in the existing
   `sharp` step (`modules/vault/watermark.ts`) cuts each photo roughly 10x
   with no loss of evidential value for a damage inspection.
2. **Add a lifecycle rule.** Move objects to an infrequent-access class after
   30 days and an archive class after 90. Infrequent-access classes carry a
   30-day minimum, a retrieval fee per GB and a 128 KB minimum billable size.
3. **Serve thumbnails in list views.** Download cost is driven by bytes;
   full-size images should load only when opened.
4. **Compare an S3-compatible provider with free egress.** The storage
   provider is endpoint-configurable (`STORAGE_ENDPOINT`), so switching is
   configuration, not code. Check data-residency requirements for KYC
   documents before moving them outside India.
5. **Set a retention policy.** Decide how long inspection photos must be kept
   and expire them after that.

### 2.7 Database and storage bill by scale

Self-hosted on AWS Mumbai, on-demand.

| | A | B | C |
|---|---|---|---|
| Postgres/TimescaleDB server | shared host | shared host | 2 x r6i.xlarge (primary + replica): about Rs 36,500 |
| Database disk | 100 GB: Rs 900 | 200 GB: Rs 1,750 | 2 x 300 GB: Rs 5,250 |
| Redis | on the host | on the host | own node pair: about Rs 10,000 |
| Whole host (API + database + Redis) | t3.large: about Rs 6,300 | m6i.xlarge: about Rs 14,200 | (API servers separate, see Part 3) |
| S3 photos at month 12 | Rs 3,500 | Rs 35,000 | Rs 3.5 lakh |
| S3 photos at month 12, resized + lifecycle | about Rs 300 | about Rs 3,000 | about Rs 30,000 |

A managed TimescaleDB service at scale C will cost more than the two
self-managed servers; what it buys is backups, failover and no database
operations work. Get a quote before deciding.

---

## Part 3. Total monthly cost by scale

| | A (100/day) | B (1,000/day) | C (10,000/day) |
|---|---|---|---|
| Razorpay | Rs 42,000 | Rs 4.25 lakh | Rs 42.5 lakh |
| Google Places | Rs 12,000 | Rs 2.6 lakh | Rs 22.6 lakh |
| Twilio SMS | Rs 29,000 | Rs 2.9 lakh | Rs 28.8 lakh |
| Hosting (API, database, Redis, network) | Rs 9,000 | Rs 19,000 | Rs 1.1 lakh |
| Photo storage at month 12 | Rs 3,500 | Rs 35,000 | Rs 3.5 lakh |
| **Total as built** | **about Rs 96,000** | **about Rs 10.3 lakh** | **about Rs 98 lakh** |
| **Total with the fixes below** | **about Rs 55,000** | **about Rs 4.8 lakh** | **about Rs 47 lakh** |

Hosting at C is three API servers behind a load balancer, the database pair,
a Redis node and data transfer.

## Part 4. Sensitivity

The bill is most sensitive to fare size, place-search caching and photo size;
telemetry volume barely moves it. Figures are for scale B (1,000 trips a day),
where the as-built total is about Rs 10.3 lakh.

| If this changes | Line affected | Effect at scale B |
|---|---|---|
| Average fare is Rs 1,200, not Rs 600 | Razorpay | Rs 4.25 lakh becomes Rs 8.5 lakh |
| No place searches hit the cache | Google Places | Rs 2.6 lakh becomes about Rs 4.9 lakh |
| Photos are 10 MB per trip, not 40 MB | S3 at month 12 | Rs 35,000 becomes about Rs 9,000 |
| Photos are 80 MB per trip | S3 at month 12 | Rs 35,000 becomes about Rs 70,000 |
| Customer phones also send location | Telemetry rows and Redis commands | Rows double to about 16 GB; still one server, under Rs 1,000 a month more disk |
| Trips average 2 hours, not 1 | Telemetry rows and Redis commands | Same as above; integration fees unchanged |
| Rupee moves 10% against the dollar | Every dollar-priced line (Places, Twilio, AWS) | About Rs 59,000 either way |

## Part 5. Savings, in order of impact

1. **Move SMS off Twilio's international route.** Indian DLT-registered
   transactional SMS is quoted at Rs 0.12–0.30 against about Rs 8. The code has
   a provider interface, so this is one new adapter.
2. **Switch place search to Autocomplete with session tokens**, and cache
   longer. Text Search bills every keystroke at the Pro rate. Autocomplete was
   estimated at about a tenth of that; confirm on Google's pricing page.
3. **Resize inspection photos and add an S3 lifecycle rule** (2.6).
4. **Negotiate Razorpay.** It offers custom pricing above Rs 5 lakh a month.
5. **Remove driver offer polling, lengthen the roles cache, sample location
   less often** (2.3). These do not reduce the bill today; they delay the
   point at which a bigger database server is needed.
6. **Set a Redis memory limit** (2.4). This is protection, not a saving.

## Part 6. Confirm before budgeting

- **Razorpay and UPI.** The booking flow holds the fare and captures later.
  Check that this is supported for UPI on your plan, and the UPI fee.
- **Cashfree.** Get the rate card from the merchant dashboard.
- **Load numbers.** Re-run the load tests on the real server.
- **GST.** 18% applies on Indian vendor invoices; it is included above only
  for Razorpay.
- **Averages.** Replace the fare, trip length and photo size assumptions with
  real figures after the first month.

## Sources

- [Twilio SMS pricing, India](https://www.twilio.com/sms/pricing/in)
- [Twilio Voice pricing, India](https://www.twilio.com/voice/pricing/in)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Google Places API cost breakdown (third party)](https://openplacesapi.com/blog/google-places-api-pricing)
- [Razorpay pricing explained (Razorpay blog)](https://razorpay.com/blog/razorpay-shopify-payment-gateway-pricing-explained/)
- [Cashfree: Aadhaar OKYC pricing help page](https://www.cashfree.com/help/678/how-much-do-i-have-to-pay-for-okyc)
- [India SMS API pricing 2026 (third party)](https://richautomate.in/blog/sms-api-pricing-india-2026)
- [Upstash Redis pricing](https://upstash.com/pricing/redis)
- [ElastiCache pricing explained (third party)](https://upstash.com/blog/aws-elasticache-pricing-explained-2026-full-cost-breakdown)
- [Tiger Data / Timescale pricing guide (third party)](https://www.modern-datatools.com/tools/tiger-data/pricing)
- [EC2 t3.large, Mumbai](https://compute.doit.com/spot/ap-south-1/t3.large)
- [EC2 m6i.xlarge, Mumbai](https://compute.doit.com/spot/ap-south-1/m6i.xlarge)
- [EC2 r6i.xlarge, Mumbai](https://www.doit.com/compute/spot/ap-south-1/r6i.xlarge)
- [AWS ap-south-1 price list (third party)](https://aws-pricing.com/ap-south-1.html)
- [AWS pricing in India (reseller guide)](https://precisiontech.in/cloud/amazon-aws-cloud/aws-pricing/)
- [USD to INR rate tracker](https://longforecast.com/usd-to-inr-forecast-2017-2018-2019-2020-2021-indian-rupee)

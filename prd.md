# MyDriver: Product Requirements (Phase 1)

## 1. What MyDriver is

MyDriver is a trusted driver-as-a-service platform for Hyderabad. The customer owns
the car. MyDriver supplies a verified, certified driver to drive it, and records every trip so
that the customer, their family and the Safety Desk can see it was done safely.

Safety is what sets it apart. Drivers pass PAN, Aadhaar and licence checks, a face match at
pickup and a customer OTP. The trip has a speed limit. Guardians follow it live. A 24x7 Safety
Desk acts on anything unusual within minutes.

## 2. Who uses it

| User | Product | Main job |
|---|---|---|
| Customer | User app (iOS/Android), customer website | Book a driver for their own car, follow the trip, pay |
| Guardian | Public tracking link (no account) | Watch a family member's trip live |
| Driver | Driver app (iOS/Android) | Get verified, take trips, prove pickup and car condition, get paid |
| Safety Desk agent | Operations console (admin.mydriver.in) | Watch live trips, handle escalations and SOS |
| Ops manager | Operations console | Approve drivers, grade tests, manage Night Shield |
| Finance | Operations console | Prices, payments, refunds, driver payouts |
| Super admin | Operations console | Everything, plus the audit ledger |

## 3. Phase 1 scope

### 3.1 Booking (customer app and website)
- Sign in with phone OTP or Google. Browsing the public site needs no account; booking does.
- Trip types: **Within city**, **Inter-city (outstation)**, **Airport transfer**.
  Full-time contracts, bus, caravan and scheduled pickup are built but switched off by phase
  toggles (`lib/features.js`). The data is kept.
- Pickup, drop and up to 3 stops per leg, chosen with live place search. One-way or round trip.
- The customer's car: choose a saved car from their Garage or enter a new one (make, model,
  engine, transmission, plate). Transmission and make suggest the driver tier.
- Driver tier: MD-Standard, MD-Auto, MD-SUV, MD-Lux, MD-Night. Prices come from live rate cards.
- Speed limit for the trip, 40–120 km/h.
- Price estimate before booking. Fare = per-km or hourly rate + ₹19 platform fee + ₹30 night fee
  (22:00–05:00).
- Minimum duration is always at least the drive time plus 10 minutes.

### 3.2 Payment
- The fare is **authorised** (held) at booking. Dispatch starts only once the hold succeeds.
- At the end of the trip MyDriver **captures** the lower of the final fare and the hold. Any
  overage is recorded as an amount due.
- The hold is released if the customer cancels or no driver is found.
- Provider: Razorpay (manual capture), with signed webhooks handled idempotently.

### 3.3 Dispatch and the trip
- Offers go to the nearest eligible drivers (5 km radius in production): approved, online,
  holding the right certification, and Night Shield for night trips.
- Pickup handshake: the driver takes a selfie that is matched to their onboarding face, and
  enters the customer's 4-digit OTP. The trip cannot start without both.
- 8-point car inspection photos before and after the trip, stored in the Trip Vault.
- Live trip: the driver's position streams over WebSocket. The customer sees the driver, speed and
  ETA.
- Integrity checks every 3 s: speed-limit breach, route deviation, lost telemetry. Each one
  becomes a warning (anomaly) and, if serious, an escalation (L0–L5).
- Silent SOS from either app goes straight to L4.
- Trip complete: final fare, rating, and a trip certificate in the Vault.

### 3.4 Safety and identity
- Guardians: up to 5 per customer. A guardian link shows route, speed and stops live and
  expires when the trip ends.
- KYC: PAN and Aadhaar (OTP) through Cashfree. Mandatory for drivers, optional for customers (who earn an
  "ID verified" badge). Only the last 4 characters are stored.
- Night Shield: drivers who qualify for night trips (tenure plus score), revocable.
- Post-trip check-in calls after night trips.

### 3.5 Driver onboarding and earnings
- Sign-up, PAN and Aadhaar verification, and a driving licence upload reviewed by Ops.
- Written and practical assessments graded in the console. Badges grant certifications.
- Onboarding states: PENDING → UNDER_REVIEW → TESTING → APPROVED (or REJECTED / SUSPENDED).
- Go online or offline. Today's earnings and trip summary. Payouts are settled by Finance.

### 3.6 Operations console (admin.mydriver.in)
- Separate build and subdomain. It cannot be reached from the customer site. Staff sign-in only
  works from the console origin. An optional IP allowlist is off by default.
- Overview dashboard (7/30/90 days), live board, live map (click a driver for trip details and
  driver record), trips search and detail, customer lookup, drivers with filters, check-ins,
  Night Shield, grading, payments, payouts, pricing (Finance can edit; changes are audited),
  and the audit ledger.
- Role-based access: SAFETY_DESK_AGENT, OPS_MANAGER, FINANCE, SUPER_ADMIN. Viewing sensitive
  data (driver map, trips, customers) is itself audited.
- Demo data toggle: `ADMIN_DEMO_DATA=show|hide`. Demo drivers are never dispatched.

## 4. Non-functional requirements
- **Privacy:** DPDP-compliant consents, minimal data (last-4 only for IDs, no plates for free drivers
  on the map), redacted logs, and every staff read of sensitive data audited.
- **Security:** production config guards refuse to boot with mock providers or weak secrets.
  Security headers are set, and staff and customer origins are separated.
- **Reliability:** idempotent webhooks, a Redis geo index for dispatch, and PgBouncer in front of
  Postgres/TimescaleDB.
- **Deployment:** Docker images, Caddy with automatic TLS, `deploy/docker-compose.prod.yml`, and CI on every
  PR (backend tests, website lint and builds).

## 5. Out of scope for Phase 1 (planned)
Full-time contracts, bus and caravan booking, scheduled pickups, corporate accounts, the agent
mobile app, and releasing evidence packets to law enforcement.

## 6. Success measures
- Booking to driver matched: under 2 minutes in the pilot zone.
- Every trip has a passed handshake, 8 inspection photos at each end, and a sealed Vault record.
- L2+ escalations reach a human agent in under 3 minutes (SLA timer on the live board).
- Zero trips start without an authorised payment hold.

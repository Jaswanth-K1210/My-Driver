# Wiring the MyDriver clients to the backend

This package is the only thing the four client apps need in order to stop using
`src/data/mock.js`. **No client files were changed by the backend work** — this
document is the map for doing that wiring.

## Setup

```ts
import { createClient } from '@mydriver/api-client'

const client = createClient({
  baseUrl: 'http://localhost:4000',
  accessToken: await loadToken(),      // SecureStore on mobile, localStorage on web
  refreshToken: await loadRefresh(),
  onTokens: (t) => persistTokens(t),   // called on login, refresh and logout
})
```

The client refreshes an expired access token transparently on the first 401 and
retries the request once. A failed refresh clears the tokens and calls
`onTokens(null)` — treat that as "log the user out".

## Two changes the backend forces on the clients

**1. The booking payload must not include `mode`.**
The backend has zero dashcam awareness. `POST /v1/trips/book` and
`POST /v1/trips/quote` reject any unknown field with a `400 VALIDATION_FAILED`
rather than ignoring it, so the mismatch surfaces immediately. The booking flows
in `website/` and `app/` currently collect and send a VisionCam mode; strip it,
and route any VisionCam interface element out to the app website instead.

**2. The login OTP is 6 digits.**
This is already what `mobile/user` and `mobile/driver` render. It is
`docs/backend_api_spec.md` that is wrong (it says 4) and should be corrected.
The *pickup handshake* OTP is a separate, 4-digit code.

## Replacement map

| Client file | Mock being replaced | Replacement call |
| :--- | :--- | :--- |
| `mobile/user/src/screens/auth/LoginScreen.jsx` | `setTimeout` in `handleSendOtp` | `client.auth.requestOtp(phone, 'CUSTOMER')` |
| `mobile/user/src/screens/auth/LoginScreen.jsx` | `setTimeout` in `handleVerifyOtp` | `client.auth.verifyOtp(phone, code, 'CUSTOMER')` |
| `mobile/user/src/screens/auth/LoginScreen.jsx` | `handleGoogleLogin` alert | `client.auth.google(idToken, 'CUSTOMER')` after `expo-auth-session` |
| `mobile/driver/src/screens/auth/*.jsx` | the same three | identical, with `'DRIVER'` |
| `mobile/*/src/screens/auth/SignupScreen.jsx` | `setTimeout` in `handleVerifyOtp` | `client.auth.verifyOtp(...)` then `client.me.update({ full_name, email })` |
| `website/src/context/AuthContext.jsx` | mock auth state | `client.auth.*` + `client.me.get()` |
| `website/src/context/TripContext.jsx` | `tripStore` mock state | `client.trips.*` + `client.realtime` |
| `website/src/data/mock.js` `SKILLS` rates | hardcoded per-km / hourly | `client.trips.quote({ ... required_certification })` |
| `website/src/data/mock.js` `PAST_TRIPS` | hardcoded array | `client.trips.list({ limit: 20 })` |
| `website/src/data/mock.js` `DEFAULT_GUARDIANS` | hardcoded array | `client.me.guardians.list()` |
| `website/src/pages/dashboard/Book.jsx` | local booking object | `client.trips.book(input, idempotencyKey)` |
| `website/src/lib/useTripTelemetry.js` | simulated telemetry loop | `client.realtime` `DRIVER_LOCATION` frames |
| `app/src/screens/driver/HandshakeScreen.jsx` | demo OTP `4821` | `client.driver.handshake(tripId, selfieBase64, otp)` |
| `app/src/screens/driver/DriverHomeScreen.jsx` | mock incoming request | `TRIP_OFFER` frame + `client.driver.respondToOffer(...)` |
| `app/src/screens/driver/DriveActiveScreen.jsx` | simulated g-force | `conn.sendDriverTelemetry(tripId, coords, sensors)` |
| `app/src/screens/customer/TripCompleteScreen.jsx` | mock fare | `client.trips.get(id)` after `COMPLETED` |

## Booking is idempotent — use it

A retried booking on a flaky mobile connection must not create two trips:

```ts
const key = `${userId}:${Date.now()}`   // generate once, reuse across retries
const trip = await client.trips.book(input, key)
```

## Realtime

```ts
const conn = await client.realtime.connect((state) => setConnectionState(state))
conn.subscribe(trip.id)

conn.on('TRIP_STATE_CHANGED', (f) => setStatus(f.status))
conn.on('DRIVER_LOCATION',    (f) => moveMarker(f.coords))
conn.on('TRIP_OFFER',         (f) => showOfferSheet(f))       // driver app
conn.on('ERROR',              (f) => console.warn(f.code, f.message))

// Driver app, once the trip is IN_TRIP — one frame per second, no faster:
// the server silently drops anything above that rate.
conn.sendDriverTelemetry(trip.id, { lat, lng, speed, heading }, { accel_z, gyro_z })
```

The connection handles ticket exchange, heartbeat replies, reconnect with
exponential backoff, and re-subscribes to every trip after a reconnect. Call
`conn.close()` on unmount.

`ANOMALY_TRIGGERED` is in the type union already but is not emitted until the
Phase 2 escalation engine ships. Handling it now is safe and forward-compatible.

## The full customer flow

```ts
const quote = await client.trips.quote({
  booking_type: 'POINT_TO_POINT',
  pickup, drop,
  required_certification: 'MD-Night',
})

const trip = await client.trips.book({ ...quoteInput, speed_ceiling_kmh: 60 }, key)
// trip.status === 'REQUESTED'; dispatch runs server-side.
// Watch TRIP_STATE_CHANGED for MATCHED -> HANDSHAKE_PENDING -> IN_TRIP.

const { otp } = await client.trips.handshakeOtp(trip.id)  // read aloud to the driver
// ...
await client.trips.rate(trip.id, 5, 'Great drive')
```

## The full driver flow

```ts
await client.driver.setAvailability('ONLINE')
// TRIP_OFFER arrives over the socket, valid for 20 seconds.
await client.driver.respondToOffer(tripId, true)
await client.driver.handshake(tripId, selfieBase64, otpFromCustomer)
// stream telemetry while driving...
await client.driver.complete(tripId)
```

## Error handling

Every failure is an `ApiError` with a stable `code`:

```ts
import { ApiError } from '@mydriver/api-client'

try {
  await client.trips.book(input, key)
} catch (err) {
  if (err instanceof ApiError) {
    if (err.code === 'PHONE_VERIFICATION_REQUIRED') return promptForPhone()
    if (err.code === 'OTP_RATE_LIMITED') return showRetryAfter(err.details)
    showError(err.message)
  }
}
```

Codes worth handling explicitly: `INVALID_OTP`, `OTP_ATTEMPTS_EXHAUSTED`,
`OTP_RATE_LIMITED`, `PHONE_VERIFICATION_REQUIRED`, `UNKNOWN_SKILL`,
`DROP_REQUIRED`, `OFFER_NOT_FOUND`, `OFFER_ALREADY_TAKEN`,
`INVALID_HANDSHAKE_OTP`, `HANDSHAKE_LOCKED`, `LIVENESS_FAILED`,
`TRIP_NOT_CANCELLABLE`, `ALREADY_RATED`, `FORBIDDEN_ROLE`.

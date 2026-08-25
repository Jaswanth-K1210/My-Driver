# Shared API client

`api-client.js` is the **canonical** MyDriver API client. It is vendored into
each app as `src/lib/api.js`:

```
prototype/website/src/lib/api.js
prototype/mobile/user/src/lib/api.js
prototype/mobile/driver/src/lib/api.js
```

Edit it **here**, then run `./sync.sh` to push the copies out.

## Why it is duplicated

Neither Metro (Expo) nor Vite resolves a module outside its own project root
without extra configuration, and a bundler-config problem would break all three
apps simultaneously. Copying is boring and reliable; the sync script keeps the
copies honest.

## Constraints

The file is plain JavaScript with **no imports**, because it has to run
unchanged in the browser and in React Native:

- `fetch` and `WebSocket` are globals in both — used directly.
- **No `Buffer`** — React Native has no global Buffer.
- **No `URLSearchParams`** — React Native only partially polyfills it.
- Storage is **injected**, not assumed: the web passes a localStorage adapter,
  the mobile apps pass an `expo-secure-store` adapter.

## What it does for you

- Attaches the bearer token to every authenticated request.
- On a 401, refreshes once and retries — collapsing concurrent 401s into a
  single refresh round trip.
- Surfaces the API error envelope as a typed `ApiError { status, code, message,
  details }`.
- Handles the WebSocket ticket exchange, heartbeat replies, reconnect with
  exponential backoff, and re-subscription after a reconnect.

## Smoke test

`smoke-test.mjs` drives the whole stack through this client — login, booking,
dispatch, handshake, telemetry, completion, rating, history and logout — and is
the fastest way to confirm the backend and the client contract still agree.

```bash
cd prototype/backend && npm run dev      # console SMS prints the OTP
node prototype/shared/smoke-test.mjs
```

It reads the OTP out of the backend log (default `/tmp/mydriver-backend.log`;
pass a different path as the first argument). Each run books in its own randomly
offset patch of map, so a leftover ONLINE driver from an earlier run cannot win
the offer — no database surgery needed to isolate it.

# AGENTS.md — Customer website & Operations Console (`prototype/website`)

**Owner: Jaswanth.** This file adds area-specific rules on top of the team rules in the root [`AGENTS.md`](../../AGENTS.md). Read that one first; if the two ever conflict, the root file wins. Jaswanth may change this file; changes to the root file need all three developers to agree.

## Stack
- Vite + React, JavaScript, `oxlint`.
- **One codebase, two builds:**
  - **Customer site** (`npm run dev` / `npm run build`).
  - **Operations Console** for `admin.mydriver.in` (`npm run dev:admin` / `npm run build:admin`, `VITE_APP_TARGET=admin`).
- Source layout:
  - Customer: `src/pages/` (public pages, `dashboard/`), `src/components/app/`.
  - Console: `src/pages/admin/`, `src/components/admin/`.
  - Shared: `src/context/`, `src/lib/`.

## Checks before every commit
```bash
npm run lint          # oxlint: 0 errors (existing warnings are OK, don't add new ones)
npm run build         # customer build
npm run build:admin   # console build
npm run check         # booking payload check (scripts/check-booking.mjs)
npm run e2e           # Playwright, when booking, Track or console flows change (needs the backend's Docker stack; see playwright.config.js)
```

## Area rules
1. **`src/lib/api.js` is a copy of `prototype/shared/api-client.js`.**
   - Edit only the shared file.
   - Run `prototype/shared/sync.sh` to copy it into the website and **both** mobile apps.
   - Commit all four files together, and say so in `progress.md` so Sanath and Umesh know their copy changed.
2. **The customer site and the console must stay separate.**
   - No operator links or admin code paths on the customer build.
   - Console routes stay behind staff auth and roles.
3. **The website should behave like the customer app.**
   - The website and Sanath's app book the same trips. When booking rules change (tier from car, stops with coordinates, safety defaults, amount due), keep both in step.
   - If the app needs to follow, raise a `REQUEST` for Sanath.
4. **The server is the source of truth for money:** show server quotes and fees only.
5. **Privacy:**
   - Never send the customer's location from the browser to third-party services. Go through the backend's `locations` endpoints.
   - On the console live map, show plates only for drivers on a trip.
6. **The console is live:** the Board and Live Map run on the `SUBSCRIBE_OPS` WebSocket with a backstop poll. Keep both paths working.
7. **Phase toggles** (`src/lib/features.js`): Phase 2 features stay switched off for the Nov 15 handover.
8. **Secrets:** `.env` stays out of git. Only `VITE_*` variables reach the browser, so never put a server secret in one.

# Admin Portal + Admin App — Build Plan

Date: 2026-09-18
Covers: web admin portal (`prototype/website`) and admin mobile app
(`prototype/mobile/admin`)

---

## 0. The database question, isolated

Two days ago the brief was "my supervisor doesn't want MongoDB, these are
relational". Today's brief is "build with MongoDB first, then route to another
database later". Those conflict, so this plan is written to **quarantine that
decision** rather than block on it.

It can be quarantined because of one structural fact:

> **Neither the admin portal nor the admin app touches a database.**
> Both are clients. They speak HTTP and WebSocket to the backend and render
> JSON. Swapping PostgreSQL for MongoDB changes *zero lines* in either app.

So sections 1–5 below are the complete plan for both applications, and they are
correct under either database. Section 6 is the database decision, stated
separately, with what each option costs.

**Nothing in sections 1–5 has to wait for that decision.** Phase 1 in
particular consumes ten backend endpoints that are already built and running.

---

## 1. What already exists

| Layer | Status |
|---|---|
| Safety Desk API — 10 `/v1/admin/*` endpoints | **Built and running** |
| RBAC: `SAFETY_DESK_AGENT`, `OPS_MANAGER`, `FINANCE`, `SUPER_ADMIN` | **Built** |
| Audit logging, including on reads | **Built** |
| `api.admin.*` client methods | **Built**, vendored into website + both apps |
| Migrations `0011`–`0013` (testing, badges, Night Shield, payouts) | Written, not executed |
| Ops/Finance API routes | Not built |
| Admin web UI | Not built |
| Admin mobile app | Not built |

The endpoints Phase 1 consumes:

```
GET  /v1/admin/stats                        desk counters
GET  /v1/admin/trips/active                 the live board
GET  /v1/admin/escalations                  queue + SLA countdown
GET  /v1/admin/escalations/:id              incident + full timeline
POST /v1/admin/escalations/:id/acknowledge  claim, stop the SLA clock
POST /v1/admin/escalations/:id/promote      raise L0-L5
POST /v1/admin/escalations/:id/resolve      close with a resolution
POST /v1/admin/escalations/:id/call         IVR to driver or customer
POST /v1/admin/escalations/:id/notify-guardians
POST /v1/admin/escalations/:id/release-evidence
```

---

## 2. Admin portal — web

### Location: `/admin` routes inside `prototype/website`

Not a separate Vite project. The website already has everything the portal
needs, working and tested:

| Already there | Reused for |
|---|---|
| `context/AuthContext.jsx` — exposes `user.role` and `user.roles` | Role gating |
| `lib/apiClient.js` — token refresh, 401 retry, localStorage | Every admin call |
| `context/ToastContext.jsx` | Action feedback |
| Tailwind 4 + `lib/utils.js` (`cn`) | Styling |
| React Router 7 | Routing |
| `components/app/DashboardLayout.jsx` | The sidebar pattern to mirror |

A separate project would duplicate all six and add a third `sync.sh` target for
the API client. The customer bundle grows by the admin chunk, which is the only
real cost — and React Router's `lazy()` keeps it out of the customer's download.

### Files

```
src/pages/admin/
  Board.jsx          stat tiles + live trip table + escalation queue
  Incident.jsx       one escalation: timeline, call, guardians, evidence
  Drivers.jsx        onboarding review queue          (Phase 2)
  DriverDetail.jsx   documents, test results, badges  (Phase 2)
  Payouts.jsx        generate, approve, mark paid     (Phase 3)
  Audit.jsx          the ledger, SUPER_ADMIN only     (Phase 4)

src/components/admin/
  AdminLayout.jsx    sidebar, mirrors DashboardLayout
  RequireRole.jsx    ~10 lines, wraps RequireAuth
  LevelBadge.jsx     L0-L5 pill, one colour scale used everywhere
  SlaTimer.jsx       counts down, turns red on breach
  useAdminPoll.js    interval + AbortController, one hook for all screens
```

### Routing

```jsx
<Route path="/admin" element={
  <RequireAuth><RequireRole any={DESK_ROLES}><AdminLayout /></RequireRole></RequireAuth>
}>
  <Route index          element={<Board />} />
  <Route path="incident/:id" element={<Incident />} />
  <Route path="drivers" element={<RequireRole any={['OPS_MANAGER','SUPER_ADMIN']}><Drivers /></RequireRole>} />
  <Route path="payouts" element={<RequireRole any={['FINANCE','SUPER_ADMIN']}><Payouts /></RequireRole>} />
  <Route path="audit"   element={<RequireRole any={['SUPER_ADMIN']}><Audit /></RequireRole>} />
</Route>
```

`RequireRole` renders a 403 panel rather than redirecting. An agent who
mistypes a URL should see why they were refused, not get silently bounced to a
customer dashboard.

> The server enforces every one of these rules independently via
> `requireRole()`. The client gating is navigation, not security — it hides
> what you cannot use, it does not protect it.

### Data refresh: polling, not WebSocket

The WebSocket gateway rejects desk agents by design — `SUBSCRIBE` fails with
`FORBIDDEN_TRIP` unless the caller is the customer or driver on that trip.
That is a correct privacy boundary and this plan does not loosen it.

So `useAdminPoll(fn, 4000)` — one hook, `AbortController` on unmount, pauses on
`document.hidden` so a backgrounded tab stops hammering the API. At the spec's
stated scale of ~42 concurrent night trips this is a few KB every four seconds.

### The live map is deferred

`/v1/admin/trips/active` returns no coordinates. A map needs a backend change
(add last-known position to the response) plus a gateway decision. Phase 1
ships the board as a **table** — sortable, with the escalation level as the
leading column. For a desk agent triaging by severity, a sorted table is
arguably better than a map anyway; the map is a demo asset.

---

## 3. Admin app — mobile

### Purpose: what an app does that the web portal cannot

An admin app is only worth building if it does something the browser cannot.
Three things qualify:

1. **Push notifications.** An L4 emergency at 02:00 must reach an on-call
   supervisor who is not sitting at the desk. `device_tokens` and the FCM
   provider are already built; nothing consumes them for admin yet.
2. **On-call triage away from a desk.** Acknowledge, call, dispatch guardians —
   from a phone.
3. **Field driver verification.** An ops manager verifying documents in person
   at an onboarding drive, camera in hand.

Everything else — payouts, the audit ledger, bulk review — stays web-only.
Building those twice is waste.

### Location: `prototype/mobile/admin`

Copy the structure of `prototype/mobile/driver` exactly — it is the closest
analogue and is already working:

```
admin/
  package.json          Expo 54, React Native 0.81, RN Screens/SafeArea
  app.json
  src/lib/api.js        vendored from prototype/shared/api-client.js
  src/lib/apiClient.js  expo-secure-store instead of localStorage
  src/lib/config.js
  src/theme/tokens.js   copied from driver
  src/context/AuthContext.jsx
  src/components/       Button, Card, Toast, StatusBar  (copy from driver)
  src/navigation/
  src/screens/auth/LoginScreen.jsx
  src/screens/desk/
    QueueScreen.jsx     escalation queue, severity-sorted
    IncidentScreen.jsx  timeline + the four actions
    StatsScreen.jsx     desk counters
  src/screens/ops/
    DriverReviewScreen.jsx   Phase 2
```

`prototype/shared/sync.sh` gains a fourth target so the API client stays
identical across website, user app, driver app, and admin app.

### Scope boundary

| In the app | Web only |
|---|---|
| Escalation queue | Payout generation |
| Incident detail + acknowledge/promote/resolve | Audit ledger browsing |
| IVR call, guardian dispatch | Bulk driver review |
| Push on L3/L4 | Assessment authoring |
| Field document capture (Phase 2) | Reporting |

### Push notifications

The one backend change the app needs: when an escalation reaches L3 or L4,
notify every user holding a desk role who has a registered device. The
`device_tokens` table and the push provider interface both exist; this is a
fan-out call added to the existing escalation service, not new infrastructure.

---

## 4. Phasing

| Phase | Deliverable | Backend needed | DB change |
|---|---|---|---|
| **1** | Web: `AdminLayout`, `RequireRole`, Board, Incident | **None — already built** | **None** |
| **2** | App: Expo scaffold, login, Queue, Incident + push | Push fan-out on L3/L4 | None |
| **3** | Web: Drivers, DriverDetail (tests, badges, documents) | `admin-ops` routes | `0011` |
| **4** | Night Shield: qualification review, shift checks, check-in queue | `night-shield` routes | `0012` |
| **5** | Web: Payouts | `admin-finance` routes | `0013` |
| **6** | Web: Audit ledger | One query route | None |
| **7** | Live map | Coordinates in API + gateway decision | None |

**Phase 1 ships a working Safety Desk with no backend and no database work at
all.** That is the argument for doing it first regardless of how section 6 is
decided.

---

## 5. Testing

- `RequireRole` unit test: each role sees exactly its permitted routes.
- `useAdminPoll`: aborts in flight on unmount; stops when `document.hidden`.
- One integration test per admin action asserting the audit row is written —
  an unaudited desk action is the failure that matters here.
- Backend RBAC is already covered by `requireRole`; add a test that a `FINANCE`
  token gets 403 on a driver-approval route and vice versa.

---

## 6. The database decision

This is the only open item, and it affects **only the backend**, not sections
1–5.

### What "build it with MongoDB" would actually mean

The backend is not greenfield. It is Fastify + `pg` with 22 tables, 10 working
admin endpoints, and a test suite. There is no partial path: an admin portal
reading Mongo while trips, escalations, and users live in Postgres would mean
the Safety Desk queue cannot join to the trip it refers to.

So "build with MongoDB" means one of:

| Option | Work | Consequence |
|---|---|---|
| **A. Port the whole backend to Mongo** | Rewrite 22 tables, 10 endpoints, the integrity engine, the escalation sweeper, the test suite | Discards working, tested code. Then rewrite again on the migration back. |
| **B. Admin-only data in Mongo, rest in Postgres** | New Mongo layer alongside `pg` | Two databases, no cross-store joins, no transaction spanning both. A payout could not atomically stamp its trips. |
| **C. Keep PostgreSQL** | **Zero** | Phase 1 starts today against endpoints that already work. |

### What is lost under A or B

These are enforced by the database today and have no MongoDB equivalent:

- **Append-only audit** on five tables, by trigger. Mongo has no equivalent; it
  becomes an application convention that any bug can violate.
- **`CHECK (tenure_days_at_check >= 180 AND score_at_check >= 85)`** — the
  Night Shield rule. Becomes application code.
- **`UNIQUE (trip_id) WHERE status <> 'RESOLVED'`** — one live incident per
  trip. Becomes a race condition.
- **The payout transaction** — stamping `payout_id` onto exactly the settled
  trips, atomically. This is the guarantee that a trip is not paid twice.
- **Every foreign key.** An escalation could reference a deleted trip.

### On "route them to another database later"

Migrations of this kind are usually paid for twice: once building on the
temporary store, once moving off it — and the second bill lands after the data
has grown and real money has flowed through the payout tables. The constraints
above would need reconstructing at that point, against data that was written
without them and may already violate them.

### Recommendation

**Option C.** Phase 1 needs no database work of any kind, so there is no
schedule argument for switching. Building the portal on the existing backend
is strictly faster than any option that involves writing a data layer first.

If MongoDB is required for a reason outside this codebase — a course
requirement, a mandated stack, an evaluator's checklist — say so and this plan
adapts to Option A, with the trade-offs above stated plainly rather than
discovered later.

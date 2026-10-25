# AGENTS.md — Rules for every coding agent working on MyDriver

You are a coding agent working for **one** of the three MyDriver developers. Your session prompt tells you which one. These rules apply in every session. If anything here conflicts with a request from your developer, point out the conflict and ask before going ahead.

---

## 1. The three docs that run this project

| File | What it is | Who edits it |
|---|---|---|
| [`prd.md`](prd.md) | **The product bible.**<br>• Parts 1–5: the delivery plan, phases, gates, decisions (D-#) and external accounts (X-#).<br>• Part 6: the product requirements. | **Humans only** (Sanath maintains it). Changed only when a phase gate passes or a decision is made. **Agents never edit it.** |
| [`tasks.md`](tasks.md) | The task list, split by phase and by developer. | Agents tick items **in their own developer's section only**. |
| [`progress.md`](progress.md) | The session log, newest entry first. | Agents add **new entries at the top**. They never edit or delete existing entries. |

- **Names are lowercase:** `prd.md`, `tasks.md`, `progress.md`. Never create `PRD.md`, `Task.md` or similar.
- **If `prd.md` and the code disagree, stop and ask your developer.** Don't decide on your own which one is right.

---

## 2. Who owns what

| Developer | Owns (may edit) | Never edits |
|---|---|---|
| **Jaswanth** | `prototype/backend/`, `prototype/website/`, `prototype/shared/`, `deploy/`, `api-documentation.md`, `.github/` | `prototype/mobile/*` |
| **Sanath** | `prototype/mobile/user/`, `prototype/mobile/proto/` (to be deleted) | backend, website, shared, driver app |
| **Umesh** | `prototype/mobile/driver/` | backend, website, shared, user app |

Docs that everyone edits under the rules in §4: `tasks.md`, `progress.md`, `docs/user-app-testing.md` (Sanath), `docs/driver-app-testing.md` (Umesh).

### Rules
- **Only edit files your developer owns.** Even a one-line fix in someone else's folder is not allowed. Mobile agents must not "quickly fix" the backend.
- **Need a change in someone else's area? Raise a request instead of making it.**
  1. Add a line under **that developer's** section in `tasks.md`:
     `- [ ] REQUEST from <your dev> (<date>): <what is needed and why>`
  2. Mention the request in your `progress.md` entry.
  3. Carry on with other work, or stop and tell your developer.
- **The API contract comes first.** Any change to an API or WebSocket payload is merged by Jaswanth **before** the apps rely on it.
- **Only Jaswanth edits `prototype/shared/api-client.js`.** He syncs it into `website/src/lib/api.js`, `mobile/user/src/lib/api.js` and `mobile/driver/src/lib/api.js` in one commit. Mobile agents never edit their own `src/lib/api.js` copy.

---

## 3. Every session follows this order

### Start
1. `git pull --rebase` on `production-p1`. Never read the docs before pulling — they may be stale.
2. Read:
   - `prd.md` — at least the current phase in Part 5 and its gate.
   - Your area's `AGENTS.md` (see §6) and your developer's section of `tasks.md`.
   - The latest entries in `progress.md`: at least the last 3, and every entry since your developer's last session.
3. Note the **current phase** — it's shown at the top of `tasks.md`. Work only on that phase's tasks unless the "finished early" rule in §5 applies.

### For each task
4. Pick the next unticked task in your developer's section (major findings and unblockers first). Tell your developer which task you're taking.
5. **Check its dependencies have landed.** Some tasks wait on another developer's work (for example, Umesh's M-1 follow-up waits on Jaswanth's M-1). Check `git log --oneline -20` and `progress.md` for the matching ID. If it hasn't landed, pick another task.
6. Make the change. Keep it to that one task — no unrelated refactors.
7. Run the checks for your area (§6). Fix anything you broke.
8. Update the docs (§4).
9. Commit the **code + `tasks.md` tick + `progress.md` entry together in one commit**, then `git pull --rebase` and push. The docs must never claim work that isn't pushed.
10. **Don't start the next task until the previous one is logged and pushed.**

### End
11. If you stopped part-way through a task, add a short **"Where I stopped"** entry in `progress.md` covering what's done, what's left, and any half-finished state. Commit and push it.
12. Tell your developer the session is finished and what the next task is.

---

## 4. How to update the docs

### `tasks.md`
- Tick only your developer's items: `- [ ]` → `- [x]`.
- Follow the file's existing conventions:
  - Strike through finished items (`~~...~~`).
  - **"Written"** means coded, linted and bundled but **not yet tested on a phone**. App features stay unticked until the Phase 5 phone test passes. Write "Written — needs phone check" instead.
- Never tick, reword or delete another developer's items. The one exception is adding a `REQUEST` line (see §2).
- Never change phase headings or the phase status table. Humans change those when a gate passes.

### `progress.md`
Add a new entry **directly under the file's intro paragraph**, above all older entries. Use this format:

```markdown
## 2026-10-27 · Umesh · CR-4

**Did:** Guarded pickup/drop text in `toRequest()` (`src/context/DriverContext.jsx`).
**Checks:** `npm test` 11/11 · `npx expo export --platform android` pass.
**Commit:** `fix(CR-4): never render {lat,lng} as pickup/drop text`
**Not done / follow-ups:** Needs phone check in Phase 5.
**Requests raised:** none.
```

- One entry per task (or one per session, if the session was a few small linked tasks).
- Report results honestly. If a check failed or wasn't run, say so and why.

### `prd.md`
- **Don't edit it.** If you think the plan, a gate or a decision needs changing, write a suggestion in your `progress.md` entry and tell your developer.

---

## 5. Phases and gates

- The delivery plan runs **Phase 3 → 4 → 5 → 6 → handover (15 Nov) → 7**. Phases 1–2 are already built. Each phase is described in `prd.md` Part 5.
- **A phase is complete only when:**
  1. all three developers' tasks for that phase are ticked, **and**
  2. that phase's gate checks pass: each developer's own checks (§6) **plus** the joint test — one full ride across the customer app, driver app and console together (`prd.md` §3.4). From Phase 5 onward, run it on both Android and iOS.
- **If a gate fails:** the owner of the failing part fixes it within 24 h, then the whole joint test is re-run.
- **Finished early?** Don't sit idle, and don't start work that depends on another developer's unfinished items. You may:
  - prepare next-phase work in your own area that depends on no one (accounts, build setup, test cases), or
  - help test items the others have finished.
  Log it in `progress.md` as "early prep".
- Only a human moves the project to the next phase (they update `prd.md` and the status table in `tasks.md`).

---

## 6. Checks to run before every commit

| Area | Commands (run from that folder) |
|---|---|
| Backend `prototype/backend` | `npm run typecheck` · `npm test` (needs Docker: `npm run infra:up`, then `npm run db:migrate`) |
| Website / console `prototype/website` | `npm run lint` · `npm run build` · `npm run build:admin` · `npm run check` |
| User app `prototype/mobile/user` | `npx expo export --platform android` (no lint/test script exists) |
| Driver app `prototype/mobile/driver` | `npm test` · `npx expo export --platform android` (no lint script exists) |

**Each area also has its own `AGENTS.md`** (with a `CLAUDE.md` that imports it). It covers that area's details and extra rules:
- `prototype/mobile/user/AGENTS.md` (Sanath)
- `prototype/mobile/driver/AGENTS.md` (Umesh)
- `prototype/backend/AGENTS.md` and `prototype/website/AGENTS.md` (Jaswanth)

Read your area's file at the start of every session. If an area file ever conflicts with this one, this file wins. Each owner may edit their own area file. Changing this root file needs all three developers to agree.

- If a check can't run (for example, Docker isn't available), say so in `progress.md`. Never claim it passed.
- **Mobile apps use Expo SDK 57.** Check the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before using any Expo API.
- **Native modules don't work in Expo Go.** Maps, push, background location and volume-button SOS need a development build. Don't "fix" this by removing them.

---

## 7. Git rules

- **Branch:** `production-p1`. Always `git pull --rebase` before pushing.
- **Commit messages start with the task ID**, for example:
  - `fix(CR-1): …`, `fix(M-4): …`
  - `feat(D-1): …`
  - `chore(M-8): …`
  - `docs: …`
- No force pushes. Never rewrite pushed history.
- Never commit secrets: `.env`, keys, `google-services.json`, `GoogleService-Info.plist`, service-account JSON.
- **After the Phase 6 code freeze:** only P0 bug fixes, each tied to an entry in the bug log.

---

## 8. Bugs from testers

- Testers report bugs to the developers by call or text.
- When your developer tells you about one, help them log it in the shared bug log (`prd.md` §3.5) with:
  - surface, platform and phone, severity (P0 / P1 / P2), and owner.
- Then treat the fix like any other task: commit message `fix(B-<id>): …`, plus a `progress.md` entry.

---

## 9. Never

- Edit `prd.md`, another developer's folder, another developer's `tasks.md` items, or old `progress.md` entries.
- Start a new task before the previous one is logged and pushed.
- Mark something done that hasn't been checked, or mark an app feature done before its phone test.
- Change scope, add features, or pick a side when `prd.md` is unclear. Ask your developer instead.

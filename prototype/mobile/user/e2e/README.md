# Customer App — Layer 3 Maestro E2E Flows (`prototype/mobile/user/e2e`)

End-to-end Maestro flows for the MyDriver Customer Mobile App (`docs/testing-plan.md` §6).
Covers the **6 critical customer paths** on an Android emulator against the desk backend first, then on preview builds against staging:

| Flow | File | Critical Path Covered |
| --- | --- | --- |
| **1. Sign in** | [`01-sign-in.yaml`](./01-sign-in.yaml) | Request Phone OTP (`Mobile number, 10 digits` -> `Send OTP`), dismiss `Code sent` alert, fill `Code digit 1`–`6`, tap `Verify`, land on `What do you need?` (`HomeScreen.jsx`). |
| **2. Book within city** | [`02-book-within-city.yaml`](./02-book-within-city.yaml) | Verify Within City route (`Cyber Towers, HITEC City` -> `Financial District, Gachibowli`), inspect `Price estimate` & `Estimated total`, tap `Find .* Driver`, verify `Confirm and pay` (`REFUNDABLE HOLD`), authorize hold, and transition to `Matching a certified driver…`. |
| **3. See driver matched & arrived** | [`03-driver-matched-and-arrived.yaml`](./03-driver-matched-and-arrived.yaml) | Simulated driver accepts offer -> `LiveTripScreen.jsx` shows `PICKUP CODE` and `Cancel trip`; driver sends pickup GPS telemetry -> banner updates to `YOUR DRIVER HAS ARRIVED` and `Driver at pickup`. |
| **4. Share pickup OTP** | [`04-share-pickup-otp.yaml`](./04-share-pickup-otp.yaml) | Verify 4-digit `Pickup code .*` and `Get a new pickup code` rotation; driver submits selfie + OTP handshake -> `PICKUP CODE` and `Cancel trip` disappear and `On the way.*`, `MAX SPEED`, `FARE LOCKED` appear. |
| **5. Complete trip & rate** | [`05-complete-and-rate.yaml`](./05-complete-and-rate.yaml) | Driver completes trip -> `TripCompleteScreen.jsx` shows `You have arrived` and `Final fare`; select `5 stars`, tap `Submit & finish`, return to `HomeScreen.jsx`. |
| **6. Cancel (free before arrival, arrival fee after arrival)** | [`06-cancel-trip.yaml`](./06-cancel-trip.yaml) | **Part A (before arrival):** tap `Cancel trip` -> verify `Cancel this trip?` and `Free until your driver arrives. The hold on your card is released.` -> confirm `Cancel trip`.<br>**Part B (after arrival):** wait for `YOUR DRIVER HAS ARRIVED` -> tap `Cancel trip` -> verify `Your driver is already at the pickup. Cancel anyway?` and `A cancellation fee.*` -> confirm `Cancel · pay ₹.*`. |
| **Full Suite** | [`suite.yaml`](./suite.yaml) | Runs `01-sign-in.yaml` through `06-cancel-trip.yaml` sequentially. |

---

## Architecture: Companion Driver & Payment Bridge ([`driver-sim.mjs`](./driver-sim.mjs))

To avoid requiring a second emulator running the Driver App in lockstep, [`driver-sim.mjs`](./driver-sim.mjs) (adapted from Jaswanth's [`prototype/website/e2e/helpers.js`](../../../website/e2e/helpers.js)) drives the backend lifecycle:

1. **Automated Mode (`driver-sim.mjs serve`):** Runs a lightweight local HTTP bridge on `http://127.0.0.1:4099`. Maestro `runScript` hooks in [`scripts/`](./scripts/) call this bridge synchronously during `maestro test` to reset Redis OTP quotas, read the 6-digit login OTP from `.api.log`, approve the mock payment hold (`POST /v1/payments/:id/mock/approve`), bring a certified driver online at Cyber Towers (`17.4504, 78.3808`), accept the trip offer, send arrival telemetry, verify the 4-digit pickup OTP handshake, and complete the trip.
2. **Step-by-Step / Autopilot CLI Mode:** Run individual subcommands (`driver-online`, `approve-payment`, `driver-accept`, `driver-arrive`, `driver-start`, `driver-complete`) or `autopilot full-trip` from a second terminal.

---

## 1. Running on an Android Emulator Against the Desk Backend

### Prerequisites
1. Install [Maestro CLI](https://maestro.mobile.dev/getting-started/installing-maestro) (`maestro --version`).
2. Start an Android emulator with the Customer development build installed (`com.mydriver.user.dev`), built with `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000`.
3. Start the desk backend with stdout tee'd to `prototype/mobile/user/e2e/.api.log` so the console SMS provider's `[OTP]` lines are readable:
   ```bash
   cd prototype/backend
   npm run infra:up
   npm run db:migrate
   npm run db:seed
   SMS_PROVIDER=console PAYMENT_PROVIDER=mock npm run dev 2>&1 | tee ../mobile/user/e2e/.api.log
   ```

### Start the Companion Bridge & Run the Suite
In Terminal 2, start the companion bridge:
```bash
node prototype/mobile/user/e2e/driver-sim.mjs serve
```

In Terminal 3, run the full Maestro suite (or any individual flow):
```bash
# Run all 6 flows end-to-end
maestro test prototype/mobile/user/e2e/suite.yaml

# Or run a single flow with a custom phone number
maestro test -e PHONE=9876543210 prototype/mobile/user/e2e/01-sign-in.yaml
```

---

## 2. Running on Preview Builds Against Staging

On a preview build (`com.mydriver.user.preview`) pointed at staging (`https://api-staging.mydriver.co.in`):

```bash
# Start companion bridge pointed at staging
API_URL=https://api-staging.mydriver.co.in node prototype/mobile/user/e2e/driver-sim.mjs serve

# Run Maestro suite against preview package ID
maestro test \
  -e APP_ID=com.mydriver.user.preview \
  -e PHONE=9876543210 \
  prototype/mobile/user/e2e/suite.yaml
```

If real SMS is enabled on staging (where backend `.api.log` is not local), pass the 6-digit login OTP via `-e OTP_CODE=123456` for `01-sign-in.yaml`, and pass the 4-digit pickup code shown on `LiveTripScreen` to `node prototype/mobile/user/e2e/driver-sim.mjs driver-start --otp <4-digit-code>`.

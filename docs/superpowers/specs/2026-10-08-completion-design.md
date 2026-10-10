# MyDriver — Completion Design (KYC, Payments, Apps, Polish)

Date: 2026-10-08
Status: Approved ("complete all the phases")

## Decisions

| Question | Decision |
|---|---|
| Providers | Razorpay (payments), Cashfree Verification Suite (PAN, Aadhaar). Mock adapters for dev/test. |
| Charge timing | Authorize the quoted fare at booking, capture the final fare at completion, release on cancel / no drivers. |
| KYC scope | Drivers: PAN + Aadhaar + verified licence are required before approval. Customers: optional "verified" badge. |
| Look and feel | Keep the dark slate + amber identity and make it consistent everywhere. |

## Phase 1 — Backend

**KYC (`modules/kyc`, `providers/kyc`)**
- `KYC_PROVIDER=mock|cashfree`. Mock: any well-formed PAN is valid; Aadhaar OTP is `123456`.
- `POST /v1/kyc/pan {pan, name}`, `POST /v1/kyc/aadhaar/otp {aadhaar}`, `POST /v1/kyc/aadhaar/verify {ref_id, otp}`, `GET /v1/kyc/status`. Open to any authenticated role.
- `kyc_verifications` stores the provider ref, the result, the name match and **the last 4 digits only**. Full PAN and Aadhaar numbers are never persisted.
- Approval gate: `setOnboardingStatus(APPROVED)` refuses unless PAN and Aadhaar are VERIFIED and a DRIVING_LICENCE document is VERIFIED.

**Driver documents**: `POST /v1/driver/documents` (base64, same pattern as Vault photos), `GET /v1/driver/onboarding`.

**Payments (`modules/payments`, `providers/payments`)**
- `PAYMENTS_PROVIDER=none|mock|razorpay`. `none` keeps the old behaviour (dispatch at once) and is what the existing test suite runs on.
- When enabled, booking creates a `payments` row and a provider order (manual capture). The trip **does not dispatch** until the payment is AUTHORIZED.
- Checkout is a backend-hosted page (`GET /v1/payments/:id/checkout`). Web and mobile open the same URL, so there is no native SDK and it works in Expo Go. The mock page has Approve/Decline buttons; the Razorpay page loads checkout.js.
- `POST /v1/payments/verify` authenticates by Razorpay signature (HMAC of `order_id|payment_id`), not JWT. It marks the payment AUTHORIZED and starts dispatch.
- `POST /v1/payments/webhook` checks the raw-body HMAC and is idempotent on the event id (`payment_events.provider_event_id` UNIQUE). It is the source of truth if the client drops mid-checkout.
- Completion captures `min(final fare, authorized amount)` after commit. Any shortfall is recorded as `amount_due`. Cancel / NO_DRIVERS_FOUND release the hold (Razorpay auto-voids uncaptured authorizations).
- `GET /v1/trips/:id/payment` (participant), `GET /v1/admin/payments`, `POST /v1/admin/payments/:id/refund` (FINANCE / SUPER_ADMIN, audited).

## Phase 2 — Admin portal (website `/admin`)
- KYC queue: per-driver PAN/Aadhaar result, name match, document review, approve/reject. Approve is disabled with the reason when the gate is not met.
- Payments: list with filters, detail, refund dialog.
- Shared layout: consistent page header, table, empty/loading/error states.

## Phase 3 — Mobile apps (Expo)
- Driver: onboarding checklist (PAN, Aadhaar OTP, licence upload), status screen until approved.
- User: checkout after booking (opens the checkout URL in the in-app browser, then polls payment status), payment status on the trip, optional KYC badge in Profile, guardian link share and SOS on the live trip.

## Phase 4 — Web refinement
- Tokens for spacing, type and colour in one place. Consistent page headers, cards and buttons across marketing, dashboard and admin.
- Navigation: dashboard ↔ public site, admin ↔ public site. Copy pass for tone and consistency. Phone-width layouts.

## Testing
- Unit: signature verification, PAN/Aadhaar input validation.
- Integration: KYC flow plus the approval gate; book → checkout → authorize → dispatch; cancel → release; complete → capture; webhook replay is a no-op; refund role separation.

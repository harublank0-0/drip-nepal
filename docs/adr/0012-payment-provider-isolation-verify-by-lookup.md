# ADR-0012: Payment provider isolation via an adapter interface; never trust redirects

Status: Draft v1 (2026-09-25)

Reviewed: 2026-09-25 · consistency review 2026-09-30 to 2026-10-01

## Status

- **Decision status:** Accepted. The port and the verify-by-lookup rule hold whichever gateway is chosen. Adapter details stay [Verify-external VX-06, VX-07] until sandbox sign-off in M8.
- **Date:** 2026-09-25
- **Deciders:** lead developer, product owner
- **Supersedes / superseded by:** — / —
- **Related open items:** OD-03 (eSewa or Khalti first), OD-02 / VX-01 (legality of platform collection), VX-06 (eSewa), VX-07 (Khalti)

Edited 2026-09-30 (consistency review): the late-capture rule of decision 8 follows [05 §6.4](../05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11) (latest attempt pays the order, a superseded one is refunded per allocation); the decision is unchanged.

## Context

Gateway payments arrive in R1.1 (M8), after a COD-only launch [Confirmed Q4]. Customers pay on mobile networks, where a tab closes or the redirect back never loads. The current `payments` table has a free-text status, no event log, no refunds and CASCADE from orders [Verified-repo, RF-15].

**What the providers document** [Verified-doc, accessed 2026-09-25]:

| Capability               | eSewa ePay v2 (<https://developer.esewa.com.np/pages/Epay>)                                                                      | Khalti KPG-2 (<https://docs.khalti.com/khalti-epayment/>)                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Start                    | Browser form POST, HMAC-SHA256 over `total_amount,transaction_uuid,product_code`                                                 | Server-side initiate returns `pidx`, `payment_url`, `expires_at`                                                               |
| Return                   | Signed Base64 payload. `failure_url` receives FAILURE **and PENDING**                                                            | GET with **unsigned** query parameters; "use the lookup API for the final validation"                                          |
| Server-to-server webhook | **None documented.** The merchant is notified by email/SMS and should use the status API if no response arrives within 5 minutes | **None documented** for web checkout                                                                                           |
| Status source            | Status API: `COMPLETE`, `PENDING`, `AMBIGUOUS`, `NOT_FOUND`, `CANCELED`, `FULL_REFUND`, `PARTIAL_REFUND`                         | Lookup: only `Completed` is success; also `Pending`, `Initiated`, `Expired`, `User canceled`, `Refunded`, `Partially refunded` |
| Refund API               | **None documented**; refunds appear only as statuses                                                                             | Documented (<https://docs.khalti.com/api/refund/>); method, auth and amount unit inconsistent (VX-07)                          |
| Limits                   | Payment fails if not completed within 5 minutes of login                                                                         | Amount above Rs 10; NPR 200 per transaction until merchant KYC; expiry docs say both 60 min and 1800 s                         |

eSewa's separate Intent API does POST a signed callback (<https://developer.esewa.com.np/pages/Intent>). No provider documents split or marketplace settlement (VX-01).

## Decision

1. **`PaymentProvider` port** (design sketch in [03 §11.2](../03-system-architecture.md#112-paymentprovider-design-sketch)). It exposes `initiate`, `referenceFromReturn`, `lookup`, and optionally `refund` and `verifyNotification`, and declares `capabilities` (`refundApi`, `serverNotifications`, `partialRefund`). Adapters never accept a transaction and return DripNepal types only. Only the OD-03 winner is built in M8, and a scripted fake backs all tests. UAT credentials (eSewa's are public) are rejected at boot in production.
2. **One provider transaction per attempt.** Each retry is a new `payments` row (`attempt_no + 1`). Its `payments.id` is sent as eSewa `transaction_uuid` or Khalti `purchase_order_id` ([05 §9.3](../05-order-payment-and-inventory-lifecycles.md#93-provider-idempotency-keys)). `UNIQUE (method, provider_payment_id)` stores Khalti's `pidx`, and a partial unique index allows one live gateway attempt per order. The exact eSewa amount string is stored for signature and status comparison (ADR-0007).
3. **Never trust redirects.** `GET /payments/{provider}/return` stores a `provider_events` row, checks eSewa's signature, and uses the payload **only to find the attempt**. It then calls `lookup`. A state change needs a success status **and** an amount equal to `amount_minor`. Khalti's unsigned `status=Completed` is ignored.
4. **One place applies outcomes.** The return handler, `payments.verify`, `inventory.expire_reservations`, daily reconciliation and any webhook all end in the same `orders.applyPaymentOutcome` transaction. It calls `payments.applyProviderResult` and `inventory.commitHeld` downward in lock order ([03 §4.4](../03-system-architecture.md#44-module-responsibilities), [05 §6.4](../05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11)). Transitions only move forward, by compare-and-set.
5. **Status mapping** (a pure function, [05 §6.4](../05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11), [03 §11.3](../03-system-architecture.md#113-anti-corruption-mapping-of-provider-statuses)):
   - **eSewa:** `COMPLETE` with a matching amount → captured. `PENDING` → keep polling. `AMBIGUOUS` → keep polling, then `needs_review`. `NOT_FOUND` → `expired`. `CANCELED` → `failed`, or `needs_review` if the payment was already captured.
   - **Khalti:** `Completed` with a matching amount → captured. `Initiated` → keep polling until `expires_at`. `Pending` → `needs_review` immediately, and polling continues. `Expired` → `expired`. `User canceled` → `cancelled`.
   - **Both:** a mismatched amount → `needs_review`. Refund statuses confirm refunds and never change the payment state.

   Edited 2026-10-01 (cross-doc check): eSewa `CANCELED` → `failed` applies to a payment that is not captured. On a `captured` payment it changes nothing: the payment stays `captured`, because `captured` has no outgoing transition, and the reversal handling of [05 §6.4](../05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11) applies ([03 §11.3](../03-system-architecture.md#113-anti-corruption-mapping-of-provider-statuses)); a captured payment never enters `needs_review` ([05 §9.5](../05-order-payment-and-inventory-lifecycles.md#95-manual-review-queue-needs_review)). This replaces "or `needs_review` if the payment was already captured". The rest of the decision is unchanged.

6. **Reconciliation is required, not optional.** `payments.verify` looks up each attempt every 1 min for 30 min after redirect, every 5 min until 2 h, and every 30 min until 24 h, then moves it to `needs_review` with an alert. `payments.reconcile_sweeper` (every 5 min) re-sends lost verify jobs, and `payments.daily_reconciliation` (06:00) compares against merchant statements ([05 §9.4](../05-order-payment-and-inventory-lifecycles.md#94-reconciliation-schedule)). Unknown outcomes never cancel orders or release stock (ADR-0008).
7. **Webhook endpoint for providers that have one** (`receivePaymentWebhook`, `POST /api/v1/webhooks/payments/{provider}`, the only CSRF exemption). It inserts `provider_events` with UNIQUE `(provider, provider_event_key)`, answers 200 once the insert is durable, and sends `payments.process_provider_event`, which does a lookup. A signed callback is a hint, not proof.
8. **Late capture** follows [05 §8.4](../05-order-payment-and-inventory-lifecycles.md#84-payment-success-after-reservation-expiry-r11). If released stock can be re-reserved, the order proceeds. Otherwise the shop order is cancelled (`stock_unavailable_after_payment`) and a system refund is created. A late capture on an `expired`, `failed` or `cancelled` attempt pays the order only if it is the order's latest attempt and its shop orders are still `awaiting_payment`; otherwise it is marked `is_late_capture` (proposed) and refunded per allocation after finance approval ([05 §6.4](../05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11), [§8.4](../05-order-payment-and-inventory-lifecycles.md#84-payment-success-after-reservation-expiry-r11)).
9. **Refund methods** ([05 §6.7](../05-order-payment-and-inventory-lifecycles.md#67-refund), [§8.8](../05-order-payment-and-inventory-lifecycles.md#88-refund-failure-and-retry-including-esewa-without-a-refund-api)):
   - `gateway_api` (Khalti): `refunds.execute` commits `processing` before the call. On a timeout or 5xx, `refunds.verify` looks up the payment and never re-sends without a lookup. After 5 inconclusive lookups the refund goes to `needs_review`.
   - `gateway_manual` (eSewa, which has no refund API): the operator refunds in the merchant portal or through support. `markRefundSucceeded` only stores eSewa's reference, and the refund stays `processing`. `refunds.verify` checks daily and marks `succeeded` when it sees `FULL_REFUND`/`PARTIAL_REFUND` covering the amount. After 3 daily checks without that, the refund goes to `needs_review`.
   - `manual_transfer` (COD and the fallback): recorded with `paid_reference`.

   Edited 2026-10-01 (cross-doc check): for `gateway_manual`, `refunds.verify` marks the refund `succeeded` only when a status check is decisive for that refund ([05 §8.8](../05-order-payment-and-inventory-lifecycles.md#88-refund-failure-and-retry-including-esewa-without-a-refund-api)), not whenever it sees `FULL_REFUND` or `PARTIAL_REFUND` covering the amount. The rest of the decision is unchanged.

10. **Outbound calls happen outside database transactions.** Each call has a 3 s connect and 10 s total timeout, carries the request ID, and has a per-provider circuit breaker. While the breaker is open, gateway checkout returns 503 `PROVIDER_UNAVAILABLE` and COD stays available ([03 §11.4](../03-system-architecture.md#114-timeouts-and-simple-circuit-breaking)).

## Alternatives considered

| Alternative                           | Why rejected                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Trust eSewa's signed success redirect | PENDING arrives at `failure_url`, a closed tab loses the redirect, and a replayed payload says nothing about the current state. |
| Wait for provider webhooks            | Neither ePay nor KPG-2 web checkout documents one.                                                                              |
| Provider calls in controllers         | Blocks a second gateway (FR-PAY-005, R2) and makes tests hit sandboxes.                                                         |
| Client-side confirmation callback     | The client can forge it.                                                                                                        |

## Consequences

**Positive**

- Orders are confirmed even when the redirect never arrives, which is common on mobile.
- One rule covers every provider, including a later connectIPS or Fonepay.
- Refund handling matches what each provider can actually do, and success is recorded only on provider evidence.

**Negative**

- Polling load on provider APIs whose rate limits are unknown (VX-06, VX-07).
- `needs_review` payments and eSewa manual refunds create finance work (runbooks in [11](../11-deployment-and-operations.md)).

**Risks**

- _Unconfirmed provider details_ (eSewa production status host, Khalti refund method, auth and unit). Mitigation: a UAT sign-off checklist in M8.
- _Platform collection needs NRB clearance_ (VX-01). The port also works with per-shop credentials if the fallback in ADR-0009 is chosen.

## When to revisit

- A provider publishes signed server-to-server notifications for ePay or KPG-2: wire them in, poll less, and keep verify-by-lookup.
- A second gateway (R2, FR-PAY-005), or connectIPS for carts above the NPR 50,000 wallet-balance cap [Verified-doc, NRB Unified Directive 2082, [research: nepal-payments](../research/nepal-payments.md), accessed 2026-09-25].
- More than 2% of gateway payments reach `needs_review` in a month [Assumption].
- VX-01 requires per-vendor merchant accounts.

## Verification

- **T-PAY-005**: the same event N times, including concurrently, gives one state change and one set of side effects.
- **T-PAY-008**: a refund times out after the provider processed it. It ends `succeeded` after lookup, with no double refund.
- Proposed in [05 §10](../05-order-payment-and-inventory-lifecycles.md#10-traceability-and-test-index):
  - **T-PAY-001**: forged Khalti return and tampered eSewa payload;
  - **T-PAY-002**: eSewa failure redirect with a `COMPLETE` lookup;
  - **T-PAY-003**: unknown outcomes;
  - **T-PAY-004**: late capture;
  - **T-PAY-006**: no provider call inside a transaction;
  - **T-PAY-007**: one key per attempt;
  - **T-PAY-010**: status mapping table and amount mismatch;
  - **T-RET-003**: eSewa manual refund;
  - **T-RET-004**: retry after lookup.
- **Contract tests** against recorded sandbox responses. **CSRF scope test** (T-API-006, proposed): only the webhook route is exempt.

## Related

- [05 §6.4, §6.7, §8.4–8.8, §9](../05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11)
- [03 §11 Provider isolation](../03-system-architecture.md#11-provider-isolation)
- [06 API design](../06-api-design.md), [07 Threat model](../07-security-threat-model-and-permissions.md)
- [ADR-0007](0007-money-integer-minor-units.md), [ADR-0008](0008-inventory-reservations-and-ledger.md), [ADR-0009](0009-multi-shop-orders-and-vendor-ledger.md), [ADR-0010](0010-postgres-jobs-pg-boss-transactional-send.md)

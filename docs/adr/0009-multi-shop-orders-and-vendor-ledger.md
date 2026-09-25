# ADR-0009: Multi-shop checkout: parent order + shop orders; vendor ledger with signed balances

Status: Draft v1 (2026-09-25)

Reviewed: critic pass A4.3 (2026-09-25)

## Status

- **Decision status:** Accepted for the order hierarchy, COD payments and the vendor ledger (R1). **Proposed** for platform-as-payee gateway collection and payouts (R1.1), pending OD-02 / VX-01.
- **Date:** 2026-09-25
- **Deciders:** product owner, lead developer; accountant and legal counsel for the R1.1 part
- **Supersedes / superseded by:** — / —
- **Related open items:** OD-02, OD-04 (commission rate and basis), OD-05 (COD commission remittance, blocks launch), OD-06 (hold days), OD-07 (refund routes), OD-11 / OD-27 (tax), VX-01, VX-02, VX-08

## Context

**Confirmed answers** (canon §1): one payment for a multi-shop cart, split into per-shop suborders (Q2). DripNepal is the payee for gateway payments and pays vendors out, subject to VX-01 (Q3). COD at launch and one wallet gateway in R1.1 (Q4). Vendors ship with their own couriers (Q5).

**Consequence for R1.** The vendor or its courier collects COD cash, so the platform holds no customer money and _the vendor owes the platform its commission_. The ledger must therefore allow negative balances and net them against later gateway credits. How vendors remit is OD-05.

**Repository** [Verified-repo, RF-07]: one `orders` row spans shops with a single `status`, `payment_status` and `shipping_total` (`1780074257570_create_orders_table.ts:18-34`). Per-shop acceptance, shipping, cancellation, commission and payout cannot be represented.

**Law and providers** [Verified-doc, `nepal_payments` research, accessed 2026-09-25]:

- E-Commerce Act 2081 s8(1) deems payment to a delivery provider as received by the business entity, and s14 makes the intermediary accept returns and refunds "notwithstanding any terms of the contract" (<https://giwmscdnone.gov.np/media/files/E-Commerce%20Act,%202081_yr7k9o5.pdf>) [Verify-external VX-02].
- Neither eSewa nor Khalti documents split payments or sub-merchants (<https://developer.esewa.com.np/pages/Epay>, <https://docs.khalti.com/khalti-epayment/>). Whether a platform may collect for vendors is unconfirmed [Verify-external VX-01].
- Income Tax Act s95A(6e): 1% advance tax on payments to platform sellers [Verify-external VX-05; OD-27].

## Decision

1. **Order hierarchy** (tables in [04a §11](../04a-data-dictionary-tables.md#11-orders-fulfillment-and-returns), machines in [05 §6.1–6.2](../05-order-payment-and-inventory-lifecycles.md#61-shoporder)):
   - `orders`: one per `placeOrder`, numbered `DN-XXXXXXX`. Its `status` (`awaiting_payment`, `placed`, `in_progress`, `completed`, `cancelled`) is written only by `recomputeOrderStatus`, in the same transaction as every shop-order change ([05 §3.8](../05-order-payment-and-inventory-lifecycles.md#38-parent-status-derivation)).
   - `shop_orders`: one per shop, numbered `DN-XXXXXXX-n`. Each has its own machine (`awaiting_payment`, `awaiting_acceptance`, `accepted`, `completed`, `cancelled`, `rejected`), shipping fee, totals, `commission_total_minor` and `acceptance_due_at`.
   - `order_items`: snapshots of title, variant, SKU, price and commission, with composite tenant FKs. Nothing cascades into orders, payments or the ledger (RESTRICT).
   - A single-shop cart is the same shape with one shop order. There is no separate code path ([05 §2.4](../05-order-payment-and-inventory-lifecycles.md#24-single-shop-checkout-is-the-degenerate-case)).
2. **Payments** ([04a §12](../04a-data-dictionary-tables.md#12-payments-and-refunds)):
   - **COD (R1):** one `payments` row per shop order (`method = 'cod'`, `shop_order_id` set) with one `payment_allocations` row. Status: `awaiting_collection` → `collected`, `not_collected` or `cancelled`.
   - **Gateway (R1.1, Proposed):** one payment (`method` `esewa` or `khalti`) for the grand total, with one `payment_allocations` row per shop order. Refunds are always per shop order and capped by that allocation. Gateway capture is applied downward in one transaction by `orders.applyPaymentOutcome`: payment, allocations, reservations, then shop orders ([03 §4.2](../03-system-architecture.md#42-how-modules-talk-to-each-other)).
3. **Vendor ledger** ([05 §7](../05-order-payment-and-inventory-lifecycles.md#7-vendor-ledger-and-settlement), [04a §13.1](../04a-data-dictionary-tables.md#131-ledger_entries)):
   - `ledger_entries` is per shop and append-only. `amount_minor` is signed, and **positive means the platform owes the vendor**. The balance is `SUM(amount_minor)` (via `sumMinor`, ADR-0007) and **may be negative**.
   - Entry types: `sale`, `shipping_income`, `commission`, `commission_reversal`, `cod_cash_held`, `refund`, `vendor_remittance`, `payout`, `payout_reversal`, `tax_withholding` (reserved and disabled until OD-27) and `adjustment`.
   - `dedupe_key` is UNIQUE, and postings use `ON CONFLICT (dedupe_key) DO NOTHING`. A correction is always a new entry, never an UPDATE.
4. **Posting rules.** The authoritative table is [05 §7.2](../05-order-payment-and-inventory-lifecycles.md#72-entry-types-and-posting-rules). In summary:
   - Nothing is posted before delivery. The delivery posting runs in the transaction that makes the shop order both `delivered` and paid (`collected` or `captured`): `sale +I`, `shipping_income +S`, `commission −K`, and for COD `cod_cash_held −(I+S)`.
   - `available_at` follows a group rule. If the posting's net is positive (gateway), its entries become available at `delivered_at + ledger_hold_days` (default 7) [Assumption A-06; OD-06]. Otherwise (COD) they are available immediately. Debts are never deferred.
   - A refund posts `refund` (negative) and `commission_reversal` (positive) only if the shop order already has a delivery posting. Refunds before delivery are between the platform and the customer only.
   - `vendor_remittance` is recorded by finance (`recordVendorRemittance`). A payout (R1.1) posts `payout`, and a bounced payout posts `payout_reversal`.
5. **Commission** is snapshotted per order item at placement and rounded half up per line (ADR-0007). Shipping is commission-free [Assumption; OD-04].

**Worked example** (COD, 10% commission [Assumption OD-04]). Shop A sells an item for Rs 2,000 with Rs 100 shipping. On delivery with cash collected, it posts `sale +200000`, `shipping_income +10000`, `commission −20000` and `cod_cash_held −210000`. Shop A's balance becomes −20000: it owes Rs 200. A later R1.1 gateway order (item Rs 3,000, shipping Rs 100) adds +280000 once available, and the next payout of 260000 nets the debt. The full two-shop example with a partial rejection and a return is in [05 §7.11](../05-order-payment-and-inventory-lifecycles.md#711-worked-example-a-two-shop-cod-order-with-a-partial-rejection-and-a-return).

## Alternatives considered

| Alternative                                            | Why rejected                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One order row with per-item status (status quo)        | Cannot hold per-shop shipping, acceptance, COD collection or commission (RF-07).                                                                                                                                                                                                              |
| Separate checkout and payment per shop                 | Contradicts Q2, and several wallet sessions in a row on mobile can leave a half-paid checkout.                                                                                                                                                                                                |
| Per-vendor merchant accounts with a gateway-side split | No provider documents it, and every vendor would need PSP KYC. Kept as the **fallback** if VX-01 rules out platform collection: only the payment side changes.                                                                                                                                |
| Mutable `balance` column on `shops`                    | No audit trail, lost updates under concurrency, and statements cannot be re-derived (VX-08).                                                                                                                                                                                                  |
| Full double-entry general ledger now                   | More than R1 needs. Platform cash, gateway balances and tax accounts stay in the accountant's books (OD-11), fed by exports. Khalti nets refunds against collections [Verified-doc, <https://khalti.com/info/terms/merchant/>, accessed 2026-09-25], which is an R1.1 reconciliation concern. |
| Forbid negative balances (prepaid deposits)            | Does not match COD, and pre-funding would put off small shops from onboarding.                                                                                                                                                                                                                |

## Consequences

**Positive**

- Shops accept, reject, ship and cancel independently. The parent status is always consistent because it is derived in the same transaction.
- Every amount on a statement traces to an entry with a deterministic `dedupe_key`, so replays cannot double-post.
- One ledger covers COD (vendor owes) and gateway (platform owes), and netting needs no schema change.

**Negative**

- Collecting COD commission in R1 is manual. Credit risk remains until OD-05 sets terms, for example a review when a balance stays below −Rs 5,000 for 30 days [Assumption OD-05].
- Parent derivation, allocation and posting logic add code that needs exhaustive tests.

**Risks**

- _VX-01 forbids platform collection._ Supersede the R1.1 payment part (per-vendor accounts). Orders and the ledger stay.
- _Tax on commission or payouts (OD-11, OD-27)._ The reserved `tax_withholding` type and the separate `sale`, `shipping_income` and `commission` entries let any tax base be computed later.

## When to revisit

- OD-02 or VX-01 answered: accept or supersede the R1.1 part.
- Total negative balances exceed the OD-05 limit for 2 consecutive months, or more than 50 vendors are active [Assumption]: automate commission collection.
- Finance needs statutory books from the system: add platform-side accounts.
- R2 partial shipments (FR-FUL-005): revisit one shipment per shop order.

## Verification

- **T-PAY-005**: the same provider event (return, lookup or callback) N times, including concurrently, gives one state change and one ledger posting.
- **T-SEC-004**: a refund above the refundable amount returns 422 `REFUND_EXCEEDS_REFUNDABLE`, with the DB CHECK as a backstop.
- Proposed in [05 §10](../05-order-payment-and-inventory-lifecycles.md#10-traceability-and-test-index):
  - **T-LED-001**: the 05 §7.11 golden example;
  - **T-LED-002**: append-only;
  - **T-LED-003**: availability group rule;
  - **T-LED-004**: payout failure carry-forward;
  - **T-LED-005**: dedupe;
  - **T-ORD-001, T-ORD-009**: parent derivation;
  - **T-CHK-010**: single shop and multi-shop give the same invariants.
- **`ledger.integrity_check`** (daily 03:00) alerts on any broken ledger identity ([05 §7.12](../05-order-payment-and-inventory-lifecycles.md#712-statements-and-integrity-checks)).

## Related

- [05 §2–3, §6–7](../05-order-payment-and-inventory-lifecycles.md#2-recommendation-multi-shop-checkout-with-one-payment)
- [04a §11–13](../04a-data-dictionary-tables.md#11-orders-fulfillment-and-returns)
- [Risks and open decisions](../risks-and-open-decisions.md#22-decision-table)
- [ADR-0007](0007-money-integer-minor-units.md), [ADR-0008](0008-inventory-reservations-and-ledger.md), [ADR-0012](0012-payment-provider-isolation-verify-by-lookup.md)

# ADR-0008: Inventory: conditional-update reservations + append-only movement ledger

Status: Draft v1 (2026-09-25)

Reviewed: 2026-09-25 · consistency review 2026-09-30 to 2026-10-01

## Status

- **Decision status:** Accepted
- **Date:** 2026-09-25
- **Deciders:** lead developer
- **Supersedes / superseded by:** — / —
- **Related open items:** `reservation_ttl_minutes` (30), the 10-minute buffer, the 90-minute cap and the 24-hour `needs_review` hold are [Assumption] values (A-09; [05 §5.3](../05-order-payment-and-inventory-lifecycles.md#53-creating-reservations) and [§5.4](../05-order-payment-and-inventory-lifecycles.md#54-expiration-job); the cap is OD-28). Provider expiry values are [Verify-external VX-06, VX-07]. Multi-location stock is R3 (FR-INV-006).

Edited 2026-09-30 (consistency review): decisions 4 and 6 follow [05 §5.4](../05-order-payment-and-inventory-lifecycles.md#54-expiration-job) and [§5.10](../05-order-payment-and-inventory-lifecycles.md#510-drift-detection-and-repair) (the lookup path, what the expiry job releases, orphan reservations); the decision is unchanged.

## Context

**Repository** [Verified-repo, RF-14]:

- Stock is one integer, `product_variants.quantity`, with no CHECK (`1780072881100_create_product_variants_table.ts:19`).
- SKU is globally unique, so shop B cannot reuse shop A's SKU and the violation reveals that it exists. Duplicate option combinations are possible.
- There are no reservations and no stock history.

**Business forces.**

- COD orders wait days between placement, vendor acceptance and delivery [Confirmed Q4, Q5], and stock must be promised during that time without counting as shipped.
- In R1.1 a gateway order waits while the customer pays. eSewa says a payment not completed within 5 minutes of login fails [Verified-doc, <https://developer.esewa.com.np/pages/Epay>, accessed 2026-09-25]. Khalti returns `expires_at` from initiate, and its docs contradict themselves on the default (60 minutes in the text, `expires_in: 1800` in the sample) [Verified-doc, <https://github.com/khalti/docs.khalti.com/blob/master/content/khalti-epayment.md>, accessed 2026-09-25].
- Vendors dispute counts, so FR-INV-001 requires a reason for every adjustment, FR-INV-003 a stocktake with an expected value, and FR-INV-005 a drift check.

**PostgreSQL.** Under READ COMMITTED, a second UPDATE of a row "will wait for the first updating transaction to commit or roll back", then "the search condition of the command (the WHERE clause) is re-evaluated" against the new row version [Verified-doc, <https://www.postgresql.org/docs/18/transaction-iso.html>, accessed 2026-09-25]. One conditional UPDATE is therefore an atomic check-and-reserve.

## Decision

1. **Three tables, one writer.** The `inventory` module is the only writer (T-ARCH-001). Other modules call its actions (`reserveForOrder`, `commitHeld`, `releaseForOrderItems`, `consumeForShipment`, `restock`, `adjust`, `stocktake`, `correct`) inside their own transaction. The full columns are in [04a §8](../04a-data-dictionary-tables.md#8-inventory).
   - `inventory_items`: one row per variant (`on_hand`, `reserved`, `version`). `inventory_items_reserved_check` enforces `reserved >= 0 AND reserved <= on_hand`, and a composite FK points to `product_variants (id, shop_id)`.
   - `inventory_reservations`: one row per order item, with `status` ∈ `held`, `committed`, `released`, `consumed`. A partial unique index allows only one open reservation per item.
   - `inventory_movements`: an append-only journal. Its kinds and reason codes follow [05 §5.2](../05-order-payment-and-inventory-lifecycles.md#52-movement-kinds). `UPDATE`/`DELETE` are revoked and blocked by a trigger ([04 §2.12](../04-domain-model-and-data-dictionary.md#212-append-only-tables)).
2. **Reserve inside `placeOrder`** (steps 8–9, [05 §4.5](../05-order-payment-and-inventory-lifecycles.md#45-the-conditional-stock-update)). Lines are processed in ascending `variant_id`, following the global lock order in 05 §4.4:

   ```sql
   UPDATE inventory_items
      SET reserved = reserved + :qty, version = version + 1, updated_at = now()
    WHERE variant_id = :variant_id AND shop_id = :shop_id AND on_hand - reserved >= :qty
   RETURNING on_hand, reserved;
   ```

   If zero rows are updated, the transaction rolls back and the API returns 409 `OUT_OF_STOCK`, with available quantities re-read after the rollback. Otherwise the reservation and a `reserve` movement are inserted in the same transaction.

3. **Reservation lifecycle** ([05 §5.3–5.8](../05-order-payment-and-inventory-lifecycles.md#53-creating-reservations), [§6.9](../05-order-payment-and-inventory-lifecycles.md#69-inventory-reservation)):
   - **COD (R1):** `committed` at placement, with no expiry. The vendor-acceptance SLA bounds the wait.
   - **Gateway (R1.1):** `held`. At placement `expires_at = now() + reservation_ttl_minutes + 10 min`. After initiation it becomes the provider expiry + 10 min. It is never shortened and never later than `orders.placed_at + 90 min`.
   - `held → committed` in the capture transaction (a `commit` movement with zero deltas). `held`/`committed → released` on cancellation, rejection or definitive payment failure.
   - `committed → consumed` when the shipment is `shipped` (a `ship` movement: `on_hand −q`, `reserved −q`). A `held` reservation can never be consumed.
   - Restock is a separate movement: `rto_restock` when the shipment reaches `returned_to_origin`, and `return_restock` when support closes a return with `restock_quantity > 0` for the line (one movement of that quantity; [04a §11.8](../04a-data-dictionary-tables.md#118-return_items)).
4. **Expiry never releases stock whose payment outcome is unknown.** `inventory.expire_reservations` runs every minute ([05 §5.4](../05-order-payment-and-inventory-lifecycles.md#54-expiration-job)). For a hold past `expires_at` whose payment is `initiated`/`pending`, it first runs the same `payments.lookupPayment` lookup and `orders.applyPaymentOutcome` transaction as `payments.verify` (ADR-0012). It releases only on a definitive non-success, and only past `expires_at`: a failed, cancelled or expired attempt before then releases nothing, because the customer may still pay again. Past `expires_at` with no live attempt (Case A), one transaction releases the held reservations and cancels the order's `awaiting_payment` shop orders. When the payment is in `needs_review`, it releases the stock 24 h after `expires_at` (reason `needs_review_timeout`) and leaves the payment for finance. Every release re-checks the payment under the parent `orders` lock and releases only `held` reservations, so stock that a concurrent capture has just committed is never released. A capture after release takes the late-capture path in [05 §8.4](../05-order-payment-and-inventory-lifecycles.md#84-payment-success-after-reservation-expiry-r11): re-reserve, or cancel with `stock_unavailable_after_payment` and refund.
5. **Vendor stock changes** ([05 §5.9](../05-order-payment-and-inventory-lifecycles.md#59-adjustments-and-stocktake)). `adjustInventory` (a delta plus one of the six adjustment reasons) and `stocktakeInventory` (`counted_quantity` plus `expected_on_hand`) are idempotent, audited conditional UPDATEs. If zero rows are updated, the API returns 409 `CONFLICT` with `errors[0].code` `stock_changed` or `below_reserved`, so a stale screen or a cut below the units promised to open orders never overwrites stock.
6. **Projection invariant.** For each variant, `on_hand = Σ on_hand_delta`, `reserved = Σ reserved_delta`, and `reserved = Σ` open reservations. `inventory.drift_check` (daily 02:30, REPEATABLE READ) alerts on any difference, and also on orphan reservations (open reservations that no open order line still needs). It never repairs automatically. A repair first closes a wrong reservation (release or consume with reason `drift_repair`), then corrects the projection with an admin `correction` movement ([05 §5.10](../05-order-payment-and-inventory-lifecycles.md#510-drift-detection-and-repair)).

## Alternatives considered

| Alternative                                        | Why rejected                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decrement `on_hand` at order time, no reservations | Cancellation, rejection, RTO and payment expiry must "give back" stock with no record of what is outstanding, and vendors cannot tell sellable stock from promised stock. |
| `SELECT … FOR UPDATE`, check in code, then UPDATE  | Correct, but two round trips per line with the lock held longer. The conditional UPDATE does the same in one statement.                                                   |
| SERIALIZABLE with retry                            | The whole checkout retries on unrelated conflicts, which causes retry storms on popular items.                                                                            |
| Redis counters                                     | A second source of truth that can disagree with PostgreSQL after a crash. Redis is not in the R1 stack (ADR-0010).                                                        |
| Movements only, no projection                      | Every availability read would need a `SUM()`.                                                                                                                             |

## Consequences

**Positive**

- Overselling is prevented twice: by the conditional UPDATE and by the `reserved <= on_hand` CHECK, which rejects a code path that forgets the guard (SQLSTATE 23514).
- Every stock change has a kind, a reason, an actor and a request ID, so vendor disputes are answered from data.
- An unknown payment outcome never frees stock that the customer may already have paid for.

**Negative**

- A hot variant serializes checkouts on its row lock.
- Three tables and a lifecycle replace one integer. RTO restock depends on the vendor recording the parcel's return.

**Risks**

- _A write path skips its movement._ Mitigation: the single-writer rule (T-ARCH-001), the drift check within 24 h, and `inventory_movements_reference_once_key`, which stops a replayed restock or ship from applying twice.
- _The expiry job stalls._ Mitigation: the stalled-reservation alert of [11 §8.6](../11-deployment-and-operations.md#86-watching-the-queues): a `held` reservation more than 5 minutes past the point where the job should have acted (Case A with no live attempt, Case B with `next_verification_at` overdue, or Case C past `expires_at` + 24 h, [05 §5.4](../05-order-payment-and-inventory-lifecycles.md#54-expiration-job)) [Assumption], plus the job-age alerts of ADR-0010.

## When to revisit

- Multi-location stock (R3, FR-INV-006): key the projection by variant and location in a superseding ADR.
- T-PERF-001 at 10× launch load shows `placeOrder` p95 above 800 ms [Assumption] because of lock waits on hot variants.
- The drift check reports any non-zero difference: treat it as an incident and review this design.

## Verification

- **T-INV-003**: two concurrent checkouts for the last unit. Exactly one succeeds, and `reserved` never exceeds `on_hand`.
- Proposed in [05 §10](../05-order-payment-and-inventory-lifecycles.md#10-traceability-and-test-index):
  - **T-INV-001**: CHECK backstop;
  - **T-INV-002**: adjustment below reserved;
  - **T-INV-004**: two expiry-job instances over 200 expired holds release each exactly once; also a superseded attempt, a failed attempt before `expires_at`, a captured order whose reservations are still `held`, and a Case C release racing a capture ([05 §5.4](../05-order-payment-and-inventory-lifecycles.md#54-expiration-job));
  - **T-INV-005**: drift detection and repair;
  - **T-INV-006**: the journal is append-only;
  - **T-INV-007**: restock paths;
  - **T-FUL-002**: only `committed` reservations are consumed;
  - **T-PAY-004**: late capture.
- **T-INV-102 (proposed)**: the one-open-reservation index.
- **T-PERF-001**: k6 checkout with contention on a few variants.

## Related

- [05 §4 Checkout](../05-order-payment-and-inventory-lifecycles.md#4-checkout-the-placeorder-algorithm) and [§5 Inventory](../05-order-payment-and-inventory-lifecycles.md#5-inventory-reservations-and-movements)
- [04a §8 Inventory tables](../04a-data-dictionary-tables.md#8-inventory)
- [ADR-0009](0009-multi-shop-orders-and-vendor-ledger.md), [ADR-0010](0010-postgres-jobs-pg-boss-transactional-send.md), [ADR-0012](0012-payment-provider-isolation-verify-by-lookup.md)

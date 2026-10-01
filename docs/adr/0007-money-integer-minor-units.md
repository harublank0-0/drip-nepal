# ADR-0007: Money as integer minor units (paisa, bigint) with explicit currency

Status: Draft v1 (2026-09-25)

Reviewed: 2026-09-25 · consistency review 2026-09-30 to 2026-10-01

## Status

- **Decision status:** Accepted
- **Date:** 2026-09-25
- **Deciders:** lead developer, product owner
- **Supersedes / superseded by:** — / —
- **Related open items:** VX-12 (NPR display prefix), OD-11 and OD-26 (VAT display and invoicing). They affect presentation and tax columns, not storage.

Edited 2026-09-30 (consistency review): decision 2 records where [09 §3.8](../09-code-structure-and-engineering-standards.md#38-actions-transactions-and-the-helpers-platform-owns) puts `Minor`; the rounding rules stay in `pricing`, and the decision is unchanged.

## Context

**Repository** [Verified-repo, RF-16, RF-25]:

- Money is `decimal(10,2)` with no currency column and no CHECKs (`product_variants.price`, `orders.grand_total`, `payments.amount` and others). The generated `database/schema.ts` types these columns as `string`.
- The UI multiplies them as JavaScript numbers (`inertia/components/commerce/cart/cart_item.tsx:112`), subtracts compare-at savings twice, and lets the client set the price.
- Prices are formatted as `'Rs. ' + value.toLocaleString('ne-NP')`, which mixes a Latin prefix with Devanagari digits.

**Framework.** Lucid 22.4.2's schema generator maps `decimal`/`numeric` to `string` and `bigint` to `bigint | number` [Verified-doc, Lucid 22.4.2 `build/src/orm/schema_generator/rules.js`, accessed 2026-09-25]. node-postgres returns `int8` as a string unless a type parser is set, and `SUM(bigint)` returns `numeric` [Verified-doc, <https://github.com/brianc/node-pg-types>, <https://www.postgresql.org/docs/18/functions-aggregate.html>, accessed 2026-09-25].

**Providers** [Verified-doc, accessed 2026-09-25]:

- Khalti KPG-2 `amount` is in paisa and must exceed Rs 10 (1000 paisa) (<https://docs.khalti.com/khalti-epayment/>).
- connectIPS `TXNAMT` is in paisa (<https://doc.connectips.com/docs/connectIPS-Gateway/merchant-interface>).
- eSewa ePay takes rupee strings in `total_amount` and signs that string (<https://developer.esewa.com.np/pages/Epay>).

**Multi-shop.** One payment is split across shop orders, and refunds, commissions and R2 coupons must be allocated so that the parts add up exactly to the whole (ADR-0009).

**Tax.** Prices are shown tax-inclusive [Verify-external VX-04, VX-02]. R1 computes no VAT: `order_items.tax_minor` is 0 and `tax_rate_bp` is null (A-16, OD-11, OD-26).

## Decision

1. **Storage.** Every amount is `<name>_minor bigint` in paisa, next to `currency char(3) NOT NULL DEFAULT 'NPR' CHECK (currency = 'NPR')`. Rates are integer basis points (`*_bp int`, 10000 = 100%). No `decimal`, `numeric`, `real` or `double precision` column exists. CHECK backstops (full SQL in [04 §16.3](../04-domain-model-and-data-dictionary.md#163-constraint-sql) and [04a](../04a-data-dictionary-tables.md)) include `orders_totals_check` (`grand_total_minor = items_subtotal_minor + shipping_total_minor - discount_total_minor`), `product_variants_compare_at_check`, `payments_captured_le_amount_check`, `payments_refunded_le_captured_check` and `refunds_amount_check`.
2. **Domain functions.** `app/modules/pricing/domain/money.ts` is the only place where rounding rules are written. It holds `mulDivHalfUp` and `allocate` and re-exports `Minor` (a safe-integer `number`), which [09 §3.8](../09-code-structure-and-engineering-standards.md#38-actions-transactions-and-the-helpers-platform-owns) defines in `app/modules/platform/money.ts` with `toMinor` and `sumMinor`, because modules below `pricing` handle prices too. It uses BigInt internally so that intermediate products cannot lose precision ([04 §18.2](../04-domain-model-and-data-dictionary.md#182-rounding-and-allocation-rules)).
3. **ORM boundary.** A global `int8` parser in `start/database_types.ts` returns a `number` and throws `RangeError` outside `Number.MAX_SAFE_INTEGER`. Schema rules loaded through `schemaGeneration.rulesPaths` type `bigint` as `number`. The repo's `config/database.ts` does not set `rulesPaths` yet. Every money aggregate goes through `sumMinor(query, column)`, which writes `SUM(...)::bigint`. Other inputs go through `toMinor(value)` ([04 §18.4](../04-domain-model-and-data-dictionary.md#184-lucid-and-node-postgres-bigint-handling)).
4. **Rounding.** Rates round half up, once per line, on non-negative magnitudes. Signs are applied after rounding. Totals are sums of rounded lines and are never rounded again.
5. **Allocation** uses the largest-remainder method, with ties going to the lower `variant_id` (unique within an order and known at quote time, [05 §3.4](../05-order-payment-and-inventory-lifecycles.md#34-discount-allocation)). It is used for payment allocations, partial refunds, commission reversals and R2 platform coupons. Partial quantities use the cumulative rule owned by [05 §3.2](../05-order-payment-and-inventory-lifecycles.md#32-amounts-as-placed-versus-effective).
6. **API and UI.**
   - JSON money is `{ "amount_minor": 976083, "currency": "NPR" }`, never a decimal or a string (ADR-0004).
   - One shared `formatNPR()` is used for SSR and in the client. It is built on `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'NPR', currencyDisplay: 'narrowSymbol' })`, which gives `Rs 12,34,567.50` on Node 24 [Verified-doc, [research: ui-frontend](../research/ui-frontend.md), Node 24.21.0]. The display prefix (`Rs` or `Rs.`) is owned by [08 §5.11](../08-ui-ux-and-design-system.md#511-money-and-numeral-display-vx-12); it stays open under [Verify-external VX-12] and does not affect storage.
   - `parseRupeesToMinor` converts vendor input (`"1299.50"` → `129950`) by string handling and never uses `parseFloat`. It right-pads the fraction to two digits before joining (`"1299.5"` → `129950`, `"1299"` → `129900`).
7. **Provider boundary.** Adapters convert amounts at the edge. Khalti receives paisa unchanged. For eSewa, integer division and `padStart` build the rupee string, and the exact string is stored on the attempt so the signature and the later status check compare the same value (ADR-0012). Inbound, eSewa rupee amounts (the status-check `total_amount` number, the return payload string) are converted with `parseRupeesToMinor` (`String(n)` for a number), never with `toMinor` or `x * 100`; Khalti amounts are paisa and go through `toMinor` ([04 §18.1](../04-domain-model-and-data-dictionary.md#181-representation)).

Worked examples (a two-shop order, per-line commission, an R2 coupon split) are in [04 §18.3](../04-domain-model-and-data-dictionary.md#183-worked-examples-paisa). One of them: a 12.5% commission on 459900 paisa is 57487.5, which rounds half up to **57488**.

## Alternatives considered

| Alternative                                       | Why rejected                                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `numeric(12,2)` + a decimal library on both sides | Values arrive as ORM strings, the library goes into the browser bundle, and every gateway boundary still converts to paisa. One missed conversion concatenates strings. |
| Floats (`double precision`, JS rupees)            | Binary rounding error (`1.15 * 100` is `114.99999999999999`), which already causes drift in the current cart (RF-16).                                                   |
| Integer rupees                                    | Khalti and connectIPS use paisa, and commission and allocation need sub-rupee precision to add up.                                                                      |
| `BigInt` end to end                               | `JSON.stringify` throws on `BigInt`, so props and job payloads break, and the values never approach 2^53.                                                               |
| `integer` columns                                 | Stops at about Rs 2.15 crore, which ledger sums and GMV reports can exceed. Changing the type later rewrites `ledger_entries`.                                          |
| PostgreSQL `money` type                           | Locale-dependent and awkward in CHECKs.                                                                                                                                 |

## Consequences

**Positive**

- Totals, allocations and ledger balances are exact. DB CHECKs reject inconsistent totals even when application code is wrong.
- Khalti and connectIPS amounts pass through unchanged. `sumMinor` makes ledger balances exact and typed (ADR-0009).
- One formatter removes the mixed-script output and SSR hydration mismatches (RF-25).

**Negative**

- Every vendor input and every display converts between rupees and paisa, and `*_minor` must always be read as paisa.
- The int8 parser, the schema rules and the `sumMinor` helper are setup work in M0.

**Risks**

- _Float arithmetic slips into business code._ Mitigation: a lint rule bans `parseFloat`, `toFixed` and division by 100 on money outside the formatter and parser files, and T-ARCH-014 (proposed) checks the money columns.
- _A raw `SUM(amount_minor)` returns a string._ Mitigation: `sumMinor` and T-ARCH-013 (proposed).
- _VAT must later be shown per line (OD-26)._ `tax_minor`, `tax_rate_bp` and half-up line rounding already allow it. The 13/113 inclusive fraction is [Verify-external VX-05].

## When to revisit

- A second currency is needed, for example INR for cross-border sales. Supersede this ADR, drop the `= 'NPR'` CHECK and add FX snapshots.
- OD-11 or OD-26 requires the platform to compute VAT. Add a tax function; storage stays in minor units.
- A provider requires amounts with sub-paisa precision or 3 decimals.
- Any amount approaches `Number.MAX_SAFE_INTEGER` (about Rs 90 trillion).

## Verification

- **T-SEC-003**: client-supplied prices and totals are rejected with 422 `VALIDATION_FAILED` (`unknown_field`), and the server computes them.
- **T-SEC-004**: a refund above the refundable amount returns 422 `REFUND_EXCEEDS_REFUNDABLE`, and a direct SQL update that breaks `refunded_minor <= captured_minor` fails.
- **T-ORD-106 (proposed)**: property test of `allocate`. Shares sum to the total, each share is within one paisa of its exact value, and the result does not depend on input order. **T-ORD-008 (proposed)** covers the cumulative rule.
- **T-ARCH-013 (proposed)**: the int8 parser round-trips 2^53 − 1, throws on 2^53, and `sumMinor` returns a `number`; also the `parseRupeesToMinor` and eSewa rupee-conversion cases of [04 §18.4](../04-domain-model-and-data-dictionary.md#184-lucid-and-node-postgres-bigint-handling).
- **T-ARCH-014 (proposed)**: money column lint (no decimal types, and every `*_minor` has a currency).
- **T-API-001**: the OpenAPI `Money` schema requires an integer `amount_minor` and the `NPR` enum.
- **CI**: the lint rule from the Risks section runs on every PR.

## Related

- [04 §2.3](../04-domain-model-and-data-dictionary.md#23-money) and [§18 Money](../04-domain-model-and-data-dictionary.md#18-money-representation-rounding-and-allocation)
- [05 §3 Amounts, discount and commission allocation](../05-order-payment-and-inventory-lifecycles.md#3-the-multi-shop-order-model)
- [08 UI/UX (formatting)](../08-ui-ux-and-design-system.md)
- [ADR-0009](0009-multi-shop-orders-and-vendor-ledger.md), [ADR-0011](0011-schema-rebaseline-before-production.md), [ADR-0012](0012-payment-provider-isolation-verify-by-lookup.md)

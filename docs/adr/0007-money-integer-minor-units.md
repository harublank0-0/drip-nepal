# ADR-0007: Money as integer minor units (paisa, bigint) with explicit currency

Status: Draft v1 (2026-09-25)

## Status

| Field              | Value                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted**                                                                                                                                 |
| Date               | 2026-09-25                                                                                                                                   |
| Deciders           | Lead developer, product owner                                                                                                                |
| Supersedes         | —                                                                                                                                            |
| Superseded by      | —                                                                                                                                            |
| Related open items | VX-12 (NPR display conventions), OD-11 / OD-26 (VAT display, invoicing): these affect presentation and tax columns, not the storage decision |

## Context

**Repository findings** [Verified-repo, RF-16, audit F9, A3-02, A3-03, A3-07]:

- Money is `decimal(10,2)` with no currency column and no CHECKs: `product_variants.price`, `orders.subtotal/discount_total/shipping_total/grand_total`, `order_items.unit_price/sub_total`, `payments.amount`.
- The generated `database/schema.ts` types them as `string` (`:367 declare price: string`, `:220 declare grandTotal: string`).
- The UI multiplies JavaScript numbers (`inertia/components/commerce/cart/cart_item.tsx:112 (item.price * item.quantity)`).
- The cart total subtracts compare-at savings twice, and the client is the source of truth for price.
- Prices are formatted as `'Rs. ' + value.toLocaleString('ne-NP')`, which in Node 24 prints Devanagari digits after a Latin prefix (RF-25).

**Framework.** Lucid 22.4.2's schema generator maps `decimal`/`numeric` to `string` and `bigint` to `bigint | number` [Verified-doc, Lucid 22.4.2 `schema_generator/rules.js`, accessed 2026-09-25]. The pg driver returns int8 as a string by default, so bigint columns need an explicit, guarded parser.

**Payment providers** [Verified-doc, `nepal_payments` research, accessed 2026-09-25]:

- Khalti KPG-2 `amount` is in paisa and must exceed Rs 10, i.e. 1000 paisa (https://docs.khalti.com/khalti-epayment/).
- connectIPS `TXNAMT` is in paisa (https://doc.connectips.com/docs/connectIPS-Gateway/merchant-interface).
- eSewa ePay sends rupee values in `amount`/`total_amount` and signs `total_amount` in the HMAC string (https://developer.esewa.com.np/pages/Epay).

**Multi-shop split.** One customer payment is split across `shop_orders`. Refunds, discounts (R2 coupons) and commissions must be allocated so the parts add up exactly to the whole (ADR-0009).

**Tax.** Prices are displayed tax-inclusive, as the Consumer Protection Act label rules and the E-Commerce Act s6 "final price incl. tax" require [Verify-external VX-04, VX-02]. DripNepal does not compute VAT in R1. `order_items.tax_minor`/`tax_rate_bp` are nullable placeholders pending OD-11 and OD-26.

**Range.** The largest safe JavaScript integer is 9,007,199,254,740,991. In paisa that is about Rs 90 trillion, far above any order, so integer paisa is exact in both PostgreSQL `bigint` and JS `number` once parsed.

## Decision

1. **Storage.** Every monetary column is `<name>_minor bigint` in paisa, paired with `currency char(3) NOT NULL DEFAULT 'NPR' CHECK (currency = 'NPR')` on the same row (R1). Rates are integer basis points (`commission_rate_bp int CHECK (0..10000)`, `tax_rate_bp`). CHECK backstops in the baseline (ADR-0011):
   - `price_minor >= 0`;
   - `compare_at_price_minor IS NULL OR compare_at_price_minor > price_minor`;
   - `grand_total_minor = items_subtotal_minor + shipping_total_minor - discount_total_minor`;
   - `captured_minor <= amount_minor`;
   - `refunded_minor <= captured_minor`;
   - `refunds.amount_minor > 0`.
2. **Domain type.** `app/modules/pricing/domain/money.ts` exports an immutable `Money` (integer `minor`, `currency`) with `add`, `subtract`, `multiply(qty)`, `percentOfBp(bp)` (half-up), `allocate(weights)` (largest remainder) and `isZero/isNegative`. It has no `toFloat()`, and constructing `Money` from a non-safe-integer throws.
3. **ORM boundary.** A shared column transform parses bigint values: it accepts `string | bigint | number`, requires `Number.isSafeInteger`, and otherwise throws. It is registered via schema rules (`schemaGeneration.rulesPaths` must be added to `config/database.ts`; the repo currently lacks it) [Verified-doc, `adonis_stack` research].
4. **Rounding.** Half-up, applied once at line level. For example, `commission_minor = roundHalfUp(line_total_minor × commission_rate_bp / 10000)`. Totals are sums of already-rounded lines and are never re-rounded.
5. **Allocation** uses the largest-remainder method, with ties broken by ascending `order_item.id` so results are deterministic. It is used for payment allocations per shop order, proportional refund splits, commission reversals, and R2 platform-coupon discounts.
6. **API and UI.**
   - JSON money is `{ "amount_minor": 250000, "currency": "NPR" }`, never decimals or strings (ADR-0004).
   - Clients format with one shared `formatNPR()` built on `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'NPR', currencyDisplay: 'narrowSymbol' })`, which in Node 24 renders `Rs 12,34,567.50` (lakh grouping, Latin digits) [Verified-doc, `ui_frontend` research, local Node 24.21.0 test; display convention VX-12].
   - Vendor price inputs accept rupees with up to 2 decimals and are parsed as strings (`"1299.50"` → `129950`) without `parseFloat`.
7. **Provider boundary.** Adapters convert at the edge. Khalti passes paisa through. eSewa strings are built with integer arithmetic (`${Math.trunc(m / 100)}.${String(m % 100).padStart(2, '0')}`), and the same string is stored on the payment attempt so the signature and later status checks compare identical values (ADR-0012).

**Worked examples**

| Case                                   | Input                                                 | Result                                                                                                                |
| -------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Commission 12.5 % on a line            | `line_total_minor` 99,950, `commission_rate_bp` 1,250 | 99,950 × 1,250 / 10,000 = 12,493.75 → half-up **12,494**                                                              |
| Refund Rs 100 split over 3 equal lines | 10,000 paisa, weights 1:1:1                           | 3,333.33 each → floors 3,333 × 3 = 9,999 → remainder 1 goes to the lowest id → **3,334 / 3,333 / 3,333** (sum 10,000) |
| Display                                | 123,456,750 paisa                                     | `formatNPR` → **Rs 12,34,567.50**                                                                                     |

## Alternatives considered

| Alternative                                                                    | Why rejected                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `numeric(12,2)` + a decimal library (decimal.js / big.js) on server and client | Values arrive as ORM strings, a library is needed in the browser bundle, rounding mode must be chosen per operation, and every gateway boundary still converts to paisa. The only real benefit is human-readable DB values. |
| Floating point (`double precision`, JS number rupees)                          | Binary rounding errors (0.1 + 0.2). It already causes drift in the current cart (RF-16).                                                                                                                                    |
| Integer rupees (no paisa)                                                      | Khalti and connectIPS work in paisa. Commission and allocation results need sub-rupee precision to add up exactly.                                                                                                          |
| Currency implied by the table (no per-row column)                              | A per-row `currency` with a CHECK costs 3 bytes and makes the single-currency invariant explicit and testable.                                                                                                              |
| Composite PostgreSQL money type or JSONB amounts                               | `SUM()`, CHECK constraints and indexes become awkward. The built-in `money` type is locale-dependent.                                                                                                                       |

## Consequences

**Positive**

- Totals, allocations and ledger balances are exact. DB CHECKs stop inconsistent totals even when application code has bugs (backstop for T-SEC-004).
- Khalti and connectIPS amounts map one to one, and the ledger `SUM(amount_minor)` is exact (ADR-0009).
- One formatter removes the Devanagari/Latin mix and SSR/client hydration differences (RF-25).

**Negative**

- Every vendor input and every display converts between rupees and paisa. Developers must remember that `*_minor` means paisa.
- The bigint parser and schema rules add setup in M0.

**Risks**

- _Someone divides by 100 into a float for display, or uses `toFixed` in business code._ Mitigation: an ESLint `no-restricted-syntax` rule bans `parseFloat` and `toFixed` in `app/modules/**` and `inertia/**` outside the formatter file. Review checklist in [docs/09](../09-code-structure-and-engineering-standards.md).
- _The VAT decision (OD-26) later requires per-line tax._ The nullable `tax_minor`/`tax_rate_bp` columns and half-up line rounding already accommodate it. The 13/113 inclusive-tax fraction [Verify-external VX-05] becomes a pricing function.

## When to revisit

- A second currency is needed, for example INR cross-border sales. Drop the `= 'NPR'` CHECK in a superseding ADR and add FX-rate snapshots.
- OD-11 or OD-26 requires the platform to compute and show VAT. Add a tax module; storage stays in minor units.
- A provider requires sub-paisa or 3-decimal amounts.

## Verification

- **Money unit tests** (T-LED/T-CHK suites in [docs/10](../10-testing-and-quality-gates.md)):
  - property-based `allocate()`: parts always sum to the input, and no part differs by more than 1 from its proportional share;
  - half-up rounding cases from the table above;
  - the parser rejects `"12.5"`, `2**53` and `NaN`.
- **T-SEC-003**: client-supplied prices and totals are ignored; the server recomputes them.
- **T-SEC-004**: a refund above the refundable amount gets 422 `REFUND_EXCEEDS_REFUNDABLE`, and a direct SQL update violating `refunded_minor <= captured_minor` fails.
- **DB constraint tests**: inserts violating each CHECK in Decision item 1 fail.
- **T-API-001**: the OpenAPI `Money` schema requires an integer `amount_minor` and the `NPR` enum.
- **Lint gate**: the ESLint rule above runs in CI.

## Related

- [Domain model and data dictionary (money columns)](../04-domain-model-and-data-dictionary.md)
- [State machines, checkout and ledger postings](../05-order-payment-and-inventory-lifecycles.md)
- [UI/UX (formatting, i18n)](../08-ui-ux-and-design-system.md)
- ADR-0009 (ledger), ADR-0012 (provider conversion), ADR-0011 (baseline CHECKs)

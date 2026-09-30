# Audit 2: Low Findings (04 and 04a)

Status: Open list (2026-09-30)

Deep audit 2 of [04 Domain model and data dictionary](../04-domain-model-and-data-dictionary.md) and [04a Data dictionary: tables](../04a-data-dictionary-tables.md) found 184 issues: 3 high, 74 medium and 107 low. The high and medium findings were verified by independent reviewers and fixed in 04, 04a and the documents they affect; the "Deep audit 2" note at the end of the consistency notes in [04](../04-domain-model-and-data-dictionary.md) summarises that work. By plan, the low findings were neither verified nor fixed, except the 6 that needed an owner decision and were fixed with it. This file keeps the other 101 so they are not lost.

**How to use this list.**

- Each entry is one reviewer's reading and has not been checked by a second reviewer. Check it against the current text before acting on it: an entry may be wrong, or already fixed by the high and medium fixes or the review that followed them.
- Line numbers are from commit `b81e3f1`, before the audit fixes. Find the text by its section and wording.
- Fix an entry when you next work in that section, or earlier if code shows that it matters. When an entry is fixed or found to be wrong, delete it in the same change.
- IN-xx numbers are follow-ups for 04 and 04a that the earlier audits of 05 and 07 queued (their A1-xx and A4-xx findings). Audit 2 applied them, so an entry that calls an IN item "queued" describes the text before those fixes and may already be resolved.
- One entry, A2-113, is an open owner decision for R2 (coupons). It stays open until coupons are planned.

## Summary

| Document                                                                                            | Open entries |
| --------------------------------------------------------------------------------------------------- | ------------ |
| [DripNepal: Context, Assumptions and Open Questions](../00-context-assumptions-and-questions.md)    | 1            |
| [DripNepal — User Journeys and Acceptance Criteria](../02-user-journeys-and-acceptance-criteria.md) | 3            |
| [Domain Model and Data Dictionary](../04-domain-model-and-data-dictionary.md)                       | 44           |
| [Data Dictionary: Tables (§5–§15)](../04a-data-dictionary-tables.md)                                | 49           |
| [Order, Payment and Inventory Lifecycles](../05-order-payment-and-inventory-lifecycles.md)          | 1            |
| [DripNepal API Design](../06-api-design.md)                                                         | 2            |
| [Deployment and Operations](../11-deployment-and-operations.md)                                     | 1            |
| Total                                                                                               | 101          |

## Fixed with an owner decision (2026-09-29)

These low findings needed a product-owner decision. The decision was made and applied in audit 2, so they are listed here only for reference.

- **A2-016**: Old shop slugs: 04 §3.13, 04a §6.1 and ADR-0017 reserve them for good, but 04a §6.10 and §19.3 release them 7 years after closure (and reserve them only per entity type). Decision: Old shop slugs are reserved FOREVER: slug_redirects rows are kept as long as the shop row (as ADR-0017 and 04a §6.1 say); remove slug_redirects from the §19.3 'Shops and their configuration' purge and from 04 note 34; state that the reservation is per entity type. ADR-0017 stays unchanged.
- **A2-086**: Shop onboarding offers 'Beauty & Personal Care', but §21.1 keeps beauty out of the product taxonomy, so such a shop has no category for its products. Decision: Keep 'Beauty & Personal Care' in the shop-category list but seed beauty-and-personal-care with is_active = false while DripNepal lists fashion only (§21.1).
- **A2-123**: No column identifies "own delivery", so the 01 tracking-number rule cannot be enforced. Decision: Tracking numbers are OPTIONAL in R1 (as 05 §6.3 says); the courier stays free text; no courier_code column. The change to 01 AC-FR-FUL-001-1 was made in audit 2. The R1 courier list is not needed.
- **A2-138**: products_brand_idx serves 're-queueing' a brand's products, a transition that 05 does not have. Decision: A watch-listed brand's live products stay live and are reviewed (blocked where needed); no new transition. Reword 04a (products_brand_idx purpose) and 04 §17.2 to 'list a brand's live products for moderator review when requires_moderation is switched on'.
- **A2-147**: addCartItem silently caps a line at 10, but 01 AC-FR-CART-001-2 says going over the limit returns 422. Decision: addCartItem caps an existing line at 10 and the response says so (keep 02, 04a, 06 §7.7 behaviour). The changes to 01 AC-FR-CART-001-2 ('adding to an existing line caps it at 10 and the response says so') and dropping '10 per line' from the 06 §13 error list were made in audit 2.
- **A2-166**: Staff may open cases for 'someone who contacted them', but support_cases cannot record a complainant who has no account. Decision: R1 support cases are only for account holders; complaints from people without an account are handled by the grievance officer by email outside the system [Assumption: needs a legal check]. No new columns. The rewording of 01 AC-FR-ADM-009-1 was made in audit 2.

## DripNepal: Context, Assumptions and Open Questions

Findings located in [00-context-assumptions-and-questions.md](../00-context-assumptions-and-questions.md).

### A2-001: 00 A-16 says the tax columns stay nullable; 04a makes tax_minor NOT NULL DEFAULT 0 (04 §18.2 rule 6 cites A-16)

- **Where:** A-16 (cited by 04 §18.2 rule 6) (lines at `b81e3f1`: 00 487; 04 1573; 04a 1803-1804)
- **Category:** cross-doc
- **Text:** 00 A-16: 'Vendor prices are VAT-inclusive, vendors invoice, and the tax columns stay nullable'; 04 §18.2 rule 6: '`tax_minor = 0` and `tax_rate_bp` is null (A-16, OD-11)'.
- **Problem:** 04a owns the columns: tax_minor is `bigint NOT NULL DEFAULT 0` and only tax_rate_bp is nullable. 04 §18.2 cites A-16 for a rule A-16 states differently. An implementer reading A-16 could make tax_minor nullable, and then the non-negativity and total CHECKs would pass NULLs through.
- **Suggested fix:** In 00 A-16, replace 'and the tax columns stay nullable' with 'and order lines record `tax_minor = 0` with a null `tax_rate_bp` (04a §11.3)'.

## DripNepal — User Journeys and Acceptance Criteria

Findings located in [02-user-journeys-and-acceptance-criteria.md](../02-user-journeys-and-acceptance-criteria.md).

### A2-002: 02 J-08 contradicts 04a, 01 and 06 on shop-application values: rejection reason length, agreement version format, return-policy minimum and two error codes

- **Where:** J-08 Shop application & approval (steps, Validation and Concurrency rows, AC-J08-02, -05, -07) | J-08 acceptance criteria vs 04a §6.4 shop_agreements (lines at `b81e3f1`: 640, 655, 657, 664, 667, 669 | 02:640, 664; 04a:411, 423)
- **Category:** cross-doc
- **Text:** 02:669 'Given a rejection without a reason of at least 10 characters, then `VALIDATION_FAILED (422)`'; 02:664 'Given the current agreement is v3 and the request says v2 ... exactly one `shop_agreements` row exists with version 3'; 02:655 'return policy shorter than 50 characters [Assumption] ... A fourth shop → `VALIDATION_FAILED (422)` with code `max_shops_reached`'; 02:657 'Slug taken ... → `CONFLICT (409)` on `slug`'
- **Problem:** (a) 04a shop_review_decisions_reason_check, 01 AC-FR-SHOP-002-3 and 06 rejectShopApplication require 20-2000 characters. 02 AC-J08-07 says 10, so a reason of 10-19 characters hits 23514, a 500. (b) 04a shop_agreements_version_check (04a:411, 423) requires the effective date as YYYY-MM-DD, but 02 step 5 and AC-J08-02 (640, 664) use integer versions such as '3', which fail with 23514. (c) The 50-character return-policy minimum exists only in 02: 04a shops_return_policy_check allows 1-5000, and 01 AC-FR-SHOP-003-1 sets only a maximum. That breaks 04 §2.8's rule that the database and the validator apply the same limits. (d) A fourth shop is 409 CONFLICT in 01 AC-FR-SHOP-001-2, 04 §3.1 and 06, not the code that AC-J08-05 gives. (e) A slug taken between the hint and submit is 422 VALIDATION_FAILED in 06 applyForShop and 04 §16.5 (shops_slug_key).
- **Suggested fix:** 02 J-08: AC-J08-07 'at least 20 characters'. Step 5 and AC-J08-02 use effective-date versions: 'the current agreement is 2026-10-01 and the request says 2026-09-25 ... exactly one shop_agreements row with agreement_version 2026-10-01', and the step 5 label reads 'Seller Agreement of {effective date}'. Validation row: drop 'shorter than 50 characters'. Only if the owner wants a minimum, change 04a to BETWEEN 50 AND 5000 and 01 AC-FR-SHOP-003-1 together. AC-J08-05 and the Validation row: CONFLICT (409). Concurrency row: a slug taken between hint and submit → VALIDATION_FAILED (422) on slug.

### A2-003: 02 J-09 says a re-invited removed member gets a fresh membership row; 04a and 03 reactivate the same row, and UNIQUE (shop_id, user_id) forbids a second one

- **Where:** J-09 Staff invitation, Recovery row (lines at `b81e3f1`: 706)
- **Category:** cross-doc
- **Text:** 02:706 'A removed member who is re-invited gets a fresh membership row status `active` again.'
- **Problem:** 04a owns the table and says the same row is reactivated. `shop_memberships_shop_user_key UNIQUE (shop_id, user_id)` makes a second row impossible, so an implementation that follows 02 and inserts fails with 23505, which 06 §5.3 turns into a 500. 03 §7.6 also says 'insert or reactivate'.
- **Suggested fix:** 02:706: 'A removed member who is re-invited and accepts gets the same membership row back, set to `active` with the new role, `removed_at` and `removed_by` cleared (04a §6.2).'

### A2-005: 02 J-20 contradicts 04a on the return window and on when return_items.condition_note is written

- **Where:** J-20 (preconditions, step 3) | J-20 Support-mediated return, step 3 (lines at `b81e3f1`: 1280, 1289 | 02:1289; 04a:2106, 04a:2127; 06:807)
- **Category:** cross-doc
- **Text:** 1280: 'Shipment `delivered` and `now() ≤ delivered_at + return_window_days`'; 1289: '`createReturnRequest` ⚷ with `{shop_order_number, items: [{order_item_id, quantity, condition_note}], reason_code, customer_note}`'
- **Problem:** (1) 04a §11.5 stores shipments.return_window_ends_at at delivery and never changes it afterwards, and 05 uses the stored value. The 02 J-20 preconditions (1280) recompute the window from the live setting. (2) 04a (2106, 2127) writes return_items.condition_note once, at receipt (recordReturnReceived or adminRecordReturnReceived). 02 J-20 step 3 (1289) sends condition notes at creation, so the receipt note would either overwrite it or be rejected.
- **Suggested fix:** 02 J-20 preconditions: 'Shipment delivered and now() ≤ shipments.return_window_ends_at (stored at delivery, 04a §11.5), or an admin override ...'. Step 3 items: [{order_item_id, quantity}]; the customer's description goes in customer_note, and condition notes are recorded at receipt (step 6). 06 createReturnRequest items[] lists only order_item_id and quantity.

## Domain Model and Data Dictionary

Findings located in [04-domain-model-and-data-dictionary.md](../04-domain-model-and-data-dictionary.md).

### A2-017: T-CAT-102 cites an error field path and input name that 06 does not use

- **Where:** §3.5 Duplicate variant combinations are impossible (Tradeoff) (lines at `b81e3f1`: 04:402)
- **Category:** cross-doc
- **Text:** 04:402 "T-CAT-102 (proposed) submits a duplicate combination and expects 422 on field `variants[n].options` … `constraint_map.ts` maps it to that field"
- **Problem:** 06 owns the field paths. `errors[].field` is a dotted path (`variants.2.sku`), and the variant input member is `option_value_codes`, so `variants[n].options` never appears. A test or constraint map written from 04 would assert the wrong field.
- **Suggested fix:** 04 §3.5: "… expects 422 on field `variants.<n>.option_value_codes` … `constraint_map.ts` maps `product_variants_product_signature_key` to that field (code `unique`)".

### A2-018: §2.12 says 03 §3.4 names the first four append-only tables; 03 names five and defers to 04's nine

- **Where:** §2.12 Append-only tables (lines at `b81e3f1`: 04:307; 03:237)
- **Category:** reference
- **Text:** 04:307 "[03 §3.4] names the first four; this document adds the other five …"
- **Problem:** 03 §3.4 now says the runtime role loses UPDATE and DELETE 'on the nine append-only tables listed in 04 §2.12 (among them audit_logs, inventory_movements, ledger_entries, order_events and shipment_events)'. That is five names, including shipment_events, and 03 points back to 04 as the list owner. The sentence in 04 is stale.
- **Suggested fix:** 04 §2.12: "This list is the one [03 §3.4](../03-system-architecture.md) refers to. The first four are the core journals; the other five are kept append-only because they are decision or consent records whose value depends on never changing."

### A2-019: §2.8 says the CHECKs restrict the citext columns to ASCII; the email CHECKs do not, and brands_slug_check is not written out with the required ::text cast

- **Where:** §2.8 Case-insensitive identifiers (lines at `b81e3f1`: 04:263, 04:264; 04a:67, 04a:388, 04a:727)
- **Category:** logic
- **Text:** 04:263 "… that advantage does not apply here because the CHECKs below restrict these columns to ASCII, and `citext` keeps `LIKE` and ordinary indexes simple." 04:264 "Category and brand slugs use the same pattern."
- **Problem:** `users_email_check` and `shop_invitations_email_check` check only length and `= lower(...)`, not ASCII. The reason given for choosing citext over nondeterministic collations therefore does not hold for the two email columns: non-ASCII case folding follows the database collation. Also, citext's `~` operator matches case-insensitively, so a slug CHECK written `slug ~ '^[a-z0-9]…'` accepts upper case. 04a correctly writes `slug::text ~` for shops, categories and slug_redirects, but `brands_slug_check` is given only as 'with the shop slug pattern', and §2.8 does not warn about the cast.
- **Suggested fix:** 04 §2.8: "… the slug CHECKs restrict slugs to ASCII; e-mail addresses are lower-cased and the validator accepts only ASCII addresses (add `AND email::text ~ '^[\x21-\x7e]+$'` to both email CHECKs if that stays the rule). Every pattern CHECK on a citext column casts to text (`slug::text ~ …`), because citext's `~` is case-insensitive." 04a §7.5: write out `brands_slug_check CHECK (slug::text ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')`.

### A2-020: §3.4 says a product can gain axes later without changing references; 04a §7.8 freezes the axis set once any variant is stocked or ordered

- **Where:** §3.4 Every product has at least one variant (Why) (lines at `b81e3f1`: 04:390; 04a:825)
- **Category:** logic
- **Text:** 04:390 "With a default variant there is no 'product without variants' branch anywhere downstream, and a product can gain axes later without changing its references."
- **Problem:** 04a §7.8 says: 'Once any variant of the product has an inventory movement or an order line, its axis set is fixed … To change axes later, the vendor archives the product and creates a new one.' Initial stock is an adjustment movement (04a:1125), so a stocked option-less product can never gain an axis. §3.4 promises the opposite, and an implementer could build an 'add size to existing product' flow that 04a forbids (409).
- **Suggested fix:** 04 §3.4 Why: "… there is no 'product without variants' branch anywhere downstream. Axes can be added while no variant has been stocked or ordered; after that the axis set is frozen (04a §7.8) and a new product is created instead."

### A2-021: The Devanagari-only product slug fallback differs: ADR-0017 uses the category slug, 04a and 09 use 'product', and §2.8 (the owner) says nothing

- **Where:** §2.8 Slugs (lines at `b81e3f1`: 04:264; 04a:744; adr/0017:39; 09:2717)
- **Category:** cross-doc
- **Text:** 04:264 "Product slugs are cosmetic, generated with `slugify` from the title, `^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 80 characters."
- **Problem:** slugify of an all-Devanagari title yields '', which fails `products_slug_check` (length ≥ 1). 04a §7.6 and 09's createProduct fall back to the literal `product`. ADR-0017, which names 04 §2.8 as the owner of the slug rules, says 'falls back to the category slug'. The owner section states neither.
- **Suggested fix:** 04 §2.8: append "If slugify yields an empty string (for example a Devanagari-only title), the slug is `product`." Change ADR-0017 decision 2 to the same fallback, or change 04a, 09 and §2.8 to the category slug, in one place.

### A2-022: Human-number collision retry (orders, returns, support cases) is described as insert-then-retry inside the business transaction, where a 23505 aborts it

- **Where:** §2.1 Human-facing identifiers (lines at `b81e3f1`: 04:95, 04:98-99)
- **Category:** sql-code
- **Text:** 04:95 "Random; insert; on unique violation (SQLSTATE 23505 on `orders_number_key`) retry up to 3 times"; return_requests and support_cases numbers 'as orders'.
- **Problem:** placeOrder inserts `orders` after the conditional stock updates, inside one transaction. A 23505 there puts the transaction in the aborted state (25P02), so a plain retry fails, the whole checkout rolls back and the customer gets an error. About 21 such collisions are expected over five years at design load. 09 handles the same case for products.public_id with a savepoint, but nothing does so for the order, return or case numbers.
- **Suggested fix:** 04 §2.1 table, Generation column for `orders.number`: "Random; `INSERT … ON CONFLICT (number) DO NOTHING RETURNING id`, and on no row retry with a new number up to 3 times (or insert inside a savepoint, `trx.transaction()`, as for `public_id`), so the checkout transaction is never aborted." The same applies to the RT- and SC- numbers and to `products.public_id`.

### A2-023: ledger_entries_shop_available_idx gives no real selectivity for payout eligibility; the scan grows with the shop's whole history

- **Where:** §17.2 "Payout eligibility"; 04a §13.1 Indexes (lines at `b81e3f1`: 04:1498; 04a:2540-2541; 05:1488-1496)
- **Category:** index-query
- **Text:** 04:1498 "`ledger_entries WHERE shop_id = ? AND entry_type <> 'payout' AND available_at <= now() AND NOT EXISTS (payout_entries …)` | `ledger_entries_shop_available_idx ON (shop_id, available_at)` + `payout_entries_ledger_entry_key` for the anti-join"
- **Problem:** Settled entries stay in the table and stay "available". Only entries younger than the return-window hold fail `available_at <= now()`, so the range covers nearly every entry the shop ever had. The index adds nothing over the `shop_id` prefix that `ledger_entries_shop_statement_idx` already has, and it costs a write on every posting. Neither index includes `shop_order_id`, which the candidate CTE of 05 §7.6 selects, so every row also needs a heap fetch plus an anti-join probe. `createPayout` and `approvePayout` both run this under the shop row lock, and the cost grows with years of history rather than with unsettled entries.
- **Suggested fix:** Drop `ledger_entries_shop_available_idx`. Change `ledger_entries_shop_statement_idx` to `(shop_id, created_at DESC, id DESC) INCLUDE (amount_minor, available_at, entry_type, shop_order_id)`, so the candidate CTE is an index-only scan plus the `payout_entries_ledger_entry_key` anti-join.
  Update 04:1498. Add a note that the cost is O(entries of the shop), to be revisited, for example with a per-shop settled watermark, when a shop passes about 100,000 entries [Assumption].

### A2-024: 06 promises q prefix search 'on indexed columns only', but no index serves the title, SKU, name or slug prefixes; 04 §17.2 documents only exact SKU

- **Where:** §17.2 "SKU search in a shop"; 06 §6.3 (lines at `b81e3f1`: 04:1412; 04a:874; 06:379-380, 389, 396)
- **Category:** cross-doc
- **Text:** 06:396 "Free-text `q` on admin lists is a prefix match on indexed columns only"; 06:379 `listShopProducts` `q` (title or SKU prefix); 06:389 `listShops` `q` (name or slug prefix); 04:1412 "`product_variants WHERE shop_id = ? AND sku = ? AND status = 'active'`"
- **Problem:** The index layer does not support the prefix searches 06 promises:
- Products have no title index.
- `product_variants_shop_sku_key` and `shops_slug_key` use the default collation, or `citext`. 04a:975 says a non-C locale needs `text_pattern_ops` for LIKE, and a citext LIKE is case-insensitive, so neither can serve a `LIKE 'x%'` prefix.
- `shops.name` has no index at all.
  The sets are small (per shop, or under 5,000 shops), so scans are acceptable. But 06's "indexed columns only" rule is false for these filters, and 04 §17.2 lists an exact-match SKU query that 06 never issues.
- **Suggested fix:** 04 §17.2: change the SKU row to "SKU or title prefix in a shop (`listShopProducts`/`listInventory` `q`) | rows of the shop from `products_seller_list_idx`, filtered in memory; exact SKU uses `product_variants_shop_sku_key`". Add a row for `listShops`/`listShopApplications` `q`: a sequential scan under 5,000 shops (§17.3).
  06:396: "prefix match, never `ILIKE '%…%'`; small sets are scanned (04 §17.2)".

### A2-025: §17.3 understates order_items size: 'under a million lines' is false at the design load and 7-year retention

- **Where:** §17.3 row `order_items (product_id)` (lines at `b81e3f1`: 04:1537; 04a:1272)
- **Category:** logic
- **Text:** 04:1537 "'Which orders contain product X' is an occasional admin investigation; a sequential scan over under a million lines is acceptable"
- **Problem:** 04a §8.3 sizes the design load at 20,000 orders a month with about 2 lines each (A-02 10x). Order lines are kept 7 years (04 §19.3). That is about 40,000 lines a month and about 3.4 million lines at steady state. The table stays under a million only for about two years at that load, so the stated "add when" trigger is based on a wrong size.
- **Suggested fix:** 04:1537: "a sequential scan over a few million lines (about 3.4 million at the A-02 10x load after 7 years) is acceptable for an occasional investigation". Keep the "A recurring report or screen needs it" trigger.

### A2-026: §1.2 release tags (no R0) and §1.4 lifecycle classes contradict the 04a headers and §2.6

- **Where:** §1.2 Evidence labels (release tags); §1.4 How to read a table entry (lifecycle classes) (lines at `b81e3f1`: 41, 70-71)
- **Category:** reference
- **Text:** 04:41 'Release tags on every table: **R1** …, **R1.1** …, **R2**, **R3**.' 04:70 'Reference | … | Never deleted; deactivated with `is_active = false`'. 04:71 'Entity | … | Never hard-deleted; ends in a terminal status'.
- **Problem:** (1) 04a tags three tables `Release R0` (sessions, rate_limits, the pgboss schema), a tag that §1.2 does not define. (2) Two tables classed Entity are hard-deleted: product_variants (a never-stocked draft variant) and inventory_items (its (0, 0) row). §2.6 lists both deletes, so §1.4 contradicts §2.6. (3) slug_redirects is classed Reference but is deleted by application code (renaming an entity back to an old slug deletes that redirect) and by the retention command (shop redirects 7 years after closure). It also has no `is_active` column, and neither do attributes, category_attributes or brands (brands uses `status`). So the Reference class's 'deactivated with is_active = false' cannot apply to these tables.
- **Suggested fix:** 04:41: add '**R0** (the reviewed baseline and package tables created before any feature milestone, for example `sessions`, `rate_limits`, the pg-boss schema)'. 04:71 Deletion cell: 'Never hard-deleted, except never-stocked draft `product_variants` and their `(0, 0)` `inventory_items` row (§2.6); ends in a terminal status'. 04:70 Deletion cell: 'Not deleted by application code, except the listed exceptions (§2.6); deactivated with `is_active = false` or a status where the table has one'. In 04a:572, class slug_redirects as 'Reference (shop rows: Configuration of the shop, deleted by rename-back and by retention)'. Also add slug_redirects rename-back to the §2.6 hard-delete list.

### A2-027: Classification contradictions: moderation notes, ledger descriptions, KYC uploads and product-image originals

- **Where:** 1.3 Sensitivity classes; 19.1 intro; 19.3 rows 'Vendor ledger', 'Abandoned and rejected uploads', 'Product images' (lines at `b81e3f1`: 50, 1746, 1822, 1844, 1845)
- **Category:** retention-privacy
- **Text:** 04:50 Internal examples 'Moderation notes, platform settings, reference codes'; 04:1746 'moderation reasons, adjustment descriptions ... is handled as Personal'; 04:1822 'Financial, no personal data'; 04:1844 'Abandoned and rejected uploads | ... | Internal'; 04:1845 'Product images | `media_assets` (`product_image`) | Public | ... not deleted in R1'
- **Problem:** (a) §1.3 classes moderation notes as Internal, while §19.1 treats moderation reasons as Personal, and 04a §6.5 classes the applicant-visible `reason` as Internal. (b) The ledger row says 'no personal data', yet `ledger_entries.description` is the typed adjustment reason and `vendor_remittances.note` is free text, which §19.1 treats as Personal. (c) A `pending_upload` or `rejected` `kyc_document` original is a citizenship scan (Sensitive-personal in the 04a §7.13 header), not Internal. (d) Product-image originals stay in the private bucket with their GPS EXIF: EXIF is stripped from derivatives only (02 AC-J10-06, 03 §3.5, 07 §5.1). They are copied nightly to Spaces and never deleted in R1, so the location of a home-based seller is kept forever under a 'Public' label.
- **Suggested fix:** (a) §1.3 Internal examples: 'Platform settings, reference codes'. Moderation reasons follow the §19.1 free-text rule, and 04a §6.5/§7.11 read 'Personal (free-text reason, §19.1)'. (b) Ledger row class: 'Financial; adjustment descriptions and remittance notes are free text (Personal, §19.1), kept with the entries'. (c) Uploads row class: 'Internal; Sensitive-personal for `kyc_document`'. (d) Split the Product images row into 'derived images: Public, not deleted in R1' and 'originals: Personal (may carry GPS EXIF and faces), private bucket'. Either store the validated original with location metadata stripped (the post-validation key proposed in queued IN-39 is written once, so it can hold the stripped file), or give originals a retention end.

### A2-028: ER diagrams omit many 04a foreign keys (ledger_entries references, platform_staff targets, shops.banner_media_id and the shops↔media_assets cycle) while §4 says they show foreign keys

- **Where:** §4 intro and §4.1–§4.5 entity blocks | §4.1, §4.3, §4.4, §4.5 (lines at `b81e3f1`: 470, 906-910, 964-972 | 478, 490, 530, 955, 990)
- **Category:** diagram
- **Text:** 04:470 'The diagrams show primary keys, foreign keys, unique business keys and the columns that explain a relationship. Every other column is in the table's section.'
- **Problem:** 04:470 implies that every FK appears in the diagrams, but many do not. The ledger_entries block (964-972) lists none of shop_order_id, order_item_id, refund_id, payout_id, remittance_id or created_by, although lines 906-910 draw those relationships. orders.shipping_district_code is missing. shops.banner_media_id is missing, and only one direction of the logo/banner reference to media_assets is drawn; together with media_assets.shop_id it forms reference cycle 1, which §20.2.2 file 6 closes, so the cycle cannot be seen. Six FKs point at platform_staff (user_id), not users: return_requests.created_by_staff_id, refunds.approved_by, payouts.created_by and approved_by, vendor_remittances.recorded_by, and support_cases.assigned_to_user_id. That is a stronger rule than a users FK, and an implementer reading the diagrams would point these columns at users. About 20 more actor, audit and location-chain FKs (\*\_by, actor_user_id, province_code, district_code, ...) are also missing.
- **Suggested fix:** Add to the ledger_entries block at 04:964: uuid shop_order_id FK, order_item_id FK, refund_id FK, payout_id FK, remittance_id FK and created_by FK. Add uuid shipping_district_code FK to orders, with districts ||--o{ orders : 'ships to' (§4.3). §4.1: add uuid banner_media_id FK on shops, and media_assets |o--o{ shops : 'logo or banner of (cycle 1)'. Draw the platform_staff targets: §4.3 platform_staff |o--o{ return_requests : 'created by'; §4.4 platform_staff |o--o{ refunds : 'approves', platform_staff ||--o{ payouts : 'creates, approves' (with created_by and approved_by FK columns) and platform_staff ||--o{ vendor_remittances : 'records'; §4.5 platform_staff |o--o{ support_cases : 'assigned' (with an assigned_to_user_id FK column). Reword 04:470: 'The diagrams show primary keys, the foreign keys of the drawn relationships (including every reference to platform_staff) and unique business keys. The other actor and audit references to users (\*\_by, actor_user_id, accepted_by_user_id, requested_by_user_id) and the province and district parts of the location chain are omitted; every foreign key is listed under the table's Keys and constraints in 04a.'

### A2-029: Optional parents drawn as mandatory: category parent, session user tag, slug-redirect shop

- **Where:** §4.1 and §4.2 (lines at `b81e3f1`: 477, 491, 637)
- **Category:** diagram
- **Text:** `users ||..o{ sessions : "tagged by user_id, no FK"`; `shops ||..o{ slug_redirects : "old slugs, entity_id"`; `categories ||--o{ categories : "parent of"`
- **Problem:** In each case the left `||` says that every child row has exactly one parent. The tables allow none. (1) `categories.parent_id` is nullable, and a top-level category has no parent (`categories_depth_check` requires `parent_id IS NULL` at depth 1). (2) `sessions.user_id` is nullable: guest sessions are never tagged, and the package's `untag` sets it to null. (3) A `slug_redirects` row with `entity_type = 'category'` points at a category, not a shop, and no diagram draws the category side.
- **Suggested fix:** 04:637 → `categories |o--o{ categories : "parent of"`; 04:477 → `users |o..o{ sessions : "tagged by user_id, no FK"`; 04:491 → `shops |o..o{ slug_redirects : "old shop slugs, entity_id"`; and add to the §4.2 diagram `categories |o..o{ slug_redirects : "old category slugs, entity_id"`.

### A2-030: 04 §4.1 ER diagram lets a district belong to many delivery zones; 04a allows at most one

- **Where:** §4.1 Identity, shops and logistics (logistics diagram) | §4.1 Identity, shops and logistics (ER) (lines at `b81e3f1`: 595)
- **Category:** diagram
- **Text:** `districts ||--o{ delivery_zone_districts : "zoned as"`
- **Problem:** 04a §9.5 declares delivery_zone_districts_district_key UNIQUE (district_code): each district is in at most one zone, which is what gives checkout a single zone and a single fee, and the seeder asserts exactly one zone per district (04 §21.5, T-SHOP-108). 04:595 draws districts ||--o{ delivery_zone_districts, a one-to-many relationship that the schema forbids.
- **Suggested fix:** Change 04:595 to districts ||--o| delivery_zone_districts : 'zoned as (at most one zone)', or ||--|| to show the seeded 'exactly one'.

### A2-031: Queued fixes IN-14 and IN-21 (ledger_adjustment_requests, refunds.replaces_refund_id) change only 04a, so §4.4 would miss a table and a relationship

- **Where:** §4.4 Payments, refunds, ledger and payouts (lines at `b81e3f1`: 890-992)
- **Category:** diagram
- **Text:** §4.4 claims to draw the ledger and refund tables with their keys. The queued follow-ups add the `ledger_adjustment_requests` table (shop_id, reverses_entry_id, shop_order_id, ledger_entry_id, created_by, approved_by) and the self-FK `refunds.replaces_refund_id`, both only to 04a.
- **Problem:** This is not a new defect in the current text. The queued fix itself is incomplete: follow-ups IN-14 and IN-15 (A1-066) and IN-21 (A1-078) change 04a §13 and §12.4 and the 04 INV-12 cell, but none updates the §4.4 ER diagram. Applied as queued, 04a would define a table and an FK that no diagram shows, which falls under 'missing tables or relations'. Both remain proposals pending the owner, so this applies only when the fix parts are applied.
- **Suggested fix:** When IN-14 and IN-21 are applied, also extend 04 §4.4 with: `shops ||--o{ ledger_adjustment_requests : "adjusted via"`, `shop_orders |o--o{ ledger_adjustment_requests : "about"`, `ledger_entries |o--o{ ledger_adjustment_requests : "reversal target"`, `ledger_entries |o--o| ledger_adjustment_requests : "posted as"` (ledger_entry_id), `platform_staff ||--o{ ledger_adjustment_requests : "requests, approves"`, an entity block (id PK, shop_id FK, amount_minor, status, reverses_entry_id FK, shop_order_id FK, ledger_entry_id FK, created_by FK, approved_by FK), and `refunds |o--o{ refunds : "replaced by"` (`|o--o|` if a UNIQUE (replaces_refund_id) is added), with `uuid replaces_refund_id FK` in the refunds block.

### A2-032: §4.4 draws every payout with one or more payout_entries, but a cancelled payout has none

- **Where:** §4.4 Payments, refunds, ledger and payouts (lines at `b81e3f1`: 914)
- **Category:** diagram
- **Text:** `payouts ||--|{ payout_entries : "settles"` (mandatory one-or-more on the payout_entries side).
- **Problem:** Cancelling a draft payout deletes all its payout_entries rows, and the payouts row stays as a `cancelled` Record. So a payout can exist with zero links. `|{` is wrong for cancelled payouts. 05 §7.12 check 3 already checks the Σ-links rule only for approved/paid/failed payouts, which agrees with 04a. Only the diagram disagrees.
- **Suggested fix:** Change 04:914 to `payouts ||--o{ payout_entries : "settles (none once cancelled)"`.

### A2-033: §4.5 prose says @adonisjs/limiter builds the limiter keys; 04a §15.4 says DripNepal code builds and hashes them

- **Where:** §4.5 prose after the diagram (lines at `b81e3f1`: 1064)
- **Category:** cross-doc
- **Text:** '`idempotency_keys` and `rate_limits` have no foreign keys: … and limiter keys are strings built by `@adonisjs/limiter` ([04a §15.4])'
- **Problem:** The cited 04a §15.4 says the opposite: 'Limiter keys are built by DripNepal code, not by the package, so the application hashes the identifying part' (HMAC of email + IP), so the table holds no raw emails or IPs and never exceeds varchar(255). If an implementer takes 04's wording to mean the package builds the keys, they may skip the key-hashing rule (T-SEC-101, and the 07 §3.6 IP normalisation queued as IN-32).
- **Suggested fix:** Replace the clause in 04:1064 with: 'and limiter keys are strings that DripNepal code builds from a prefix and an HMAC of the identifying part ([04a §15.4](../04a-data-dictionary-tables.md)); the package only stores them'.

### A2-034: §16.1 example is wrong: CHECK (quantity BETWEEN 1 AND 10) does not reject 1.5 on an int column

- **Where:** §16.1 (lines at `b81e3f1`: 1086)
- **Category:** sql-code
- **Text:** 'A JSON body `{"quantity": 1.5}` satisfies a `quantity: number` type. Only `vine.number().withoutDecimals()` or `CHECK (quantity BETWEEN 1 AND 10)` rejects it.'
- **Problem:** The CHECK never sees 1.5. On an `int` column, a numeric literal is cast by assignment and rounded to 2, which passes the CHECK and is stored. A bound text parameter '1.5' (node-postgres) fails in the int4 input function with 22P02 before any CHECK runs. Reproduced on PostgreSQL 17: `INSERT … VALUES (1, 1.5)` stored quantity 2; `EXECUTE p(2,'1.5')` gave 'invalid input syntax for type integer'. So the only layer that rejects the value cleanly is the validator, and 22P02 has no constraint name for the §16.5 map.
- **Suggested fix:** Replace with: 'A JSON body `{"quantity": 1.5}` satisfies a `quantity: number` type. Only `vine.number().withoutDecimals()` rejects it with a field error. The database either refuses the bound value with 22P02 (no constraint name, so a 500) or, if 1.5 reaches SQL as a numeric literal, rounds it to 2, which the CHECK then accepts.'

### A2-039: INV-20 leaf check differs from §3.6 and drops the 'category is active' condition

- **Where:** §16.2 INV-20 (lines at `b81e3f1`: 1118, 410)
- **Category:** logic
- **Text:** INV-20 application validation: '`NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = :category_id AND is_active)`'. §3.6: 'the category is active and `NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = :category_id)`'.
- **Problem:** With `AND is_active`, a category whose children are all deactivated counts as a leaf, so products can attach to a node that has child rows. When a child is reactivated, the parent has products, which the seeder rule 'a category that has products cannot receive a child' exists to prevent. INV-20 also omits 'the category is active', which 04a §7.1 relies on when it deactivates categories only after their products move.
- **Suggested fix:** Replace the INV-20 validation cell with: 'The category exists with `is_active` and `NOT EXISTS (SELECT 1 FROM categories WHERE parent_id = :category_id)` (§3.6); otherwise 422'.

### A2-041: Test IDs cited for INV-24 and INV-16 test other behaviour

- **Where:** §16.2 INV-24, INV-16; §16.4 payout row (lines at `b81e3f1`: 1122, 1114, 1326)
- **Category:** reference
- **Text:** INV-24 tests: 'T-LED-004, T-LED-102 (proposed)'; §16.4 payout row: 'T-LED-004'; INV-16 tests: 'T-PAY-101, T-PAY-007 (proposed)'.
- **Problem:** 05 §10 defines T-LED-004 as 'payout failure carry-forward, and a transfer returned after `paid`'. The eligibility and double-inclusion behaviour behind INV-24 (createPayout as dripnepal_app, concurrent createPayout/approvePayout, payout_stale) is T-LED-006. 05 defines T-PAY-007 as 'one key per attempt' (provider idempotency key). The live-attempt uniqueness and superseded late captures are covered by T-PAY-004 and T-PAY-003.
- **Suggested fix:** INV-24 Tests: 'T-LED-006, T-LED-102 (proposed); T-LED-004 for the identity after a failed payout'. §16.4 payout row: keep T-LED-004 and add T-LED-006. INV-16 Tests: 'T-PAY-101, T-PAY-003, T-PAY-004 (proposed)'.

### A2-042: INV-26: concurrent logins of one user can collide on carts_active_user_key during guest-cart adoption

- **Where:** §16.2 INV-26 (lines at `b81e3f1`: 1124)
- **Category:** edge-case
- **Text:** 'the merge at login locks both carts in `id` order'.
- **Problem:** When the user has no active cart, 04a adopts the guest cart by setting `user_id`. Two logins by the same user from two browsers, each with its own guest cart, lock different guest rows and find no user cart. Both adopt, and the second fails with 23505 on `carts_active_user_key`. §16.5 maps that to 409 CONFLICT, so the login (or its merge step) fails. Locking 'both carts' does not serialise the case where one of the carts does not exist yet.
- **Suggested fix:** INV-26 transaction cell: 'the merge at login first takes `SELECT … FROM users WHERE id = :u FOR NO KEY UPDATE`, then locks the carts in `id` order; if the user now has an active cart, it merges into it, otherwise it adopts'. Mirror this in 04a §10.1. Add a two-browser login case to T-CART-101.

### A2-043: §16.4 says createPayout computes the amount 'from the rows it locks'; it cannot lock ledger rows (queued IN-12 fixes only the INV-24 row)

- **Where:** §16.4 Rules that cannot be constraints (lines at `b81e3f1`: 1326)
- **Category:** cross-doc
- **Text:** 'A payout equals the sum of its linked entries | `createPayout` computes the amount from the rows it locks'.
- **Problem:** 05 §7.6 says the query 'locks no rows, because the app role cannot lock `ledger_entries` rows'. createPayout serialises on the `shops` row instead, and approvePayout re-runs the query and may reset `amount_minor` after posting `tax_withholding`. The queued IN-12 fixes the same false claim only in the INV-24 row, not in this §16.4 row.
- **Suggested fix:** Replace the cell with: '`createPayout` (shop row locked `FOR UPDATE`, 05 §4.4 level 0) and `approvePayout` (re-check, and the §7.9 tax reset) set `amount_minor` to Σ of the linked entries in the same transaction'.

### A2-049: VAT rule hard-codes 13/113 although tax_rate_bp exists and the register records several VAT rates up to 13%

- **Where:** 18.2 rule 6 (Tax) (lines at `b81e3f1`: 1573)
- **Category:** money
- **Text:** "If the accountant later requires the VAT portion of an inclusive price, it would be `mulDivHalfUp(line_total_minor, 13, 113)` per line, using the 13/113 tax fraction for 13% VAT"
- **Problem:** order_items carries tax_rate_bp (int, 0..10000) to record the rate per line. The risk register's verified-official source row says 'VAT 13%, with multiple rates ≤ 13% allowed from Finance Act 2083'. A formula fixed at 13/113 gives the wrong VAT portion for any line at another rate, and it ignores the column meant to drive it.
- **Suggested fix:** Write rule 6 as: '... it would be `mulDivHalfUp(line_total_minor, tax_rate_bp, 10000 + tax_rate_bp)` per line, stored in tax_minor with the line's tax_rate_bp (13/113 when tax_rate_bp = 1300) [Verify-external VX-05; rounding rule to be confirmed under OD-26].'

### A2-050: §18.2 declares the Minor type in pricing/domain/money.ts; 09 (owner of code structure) puts it in platform/money.ts

- **Where:** 18.2 Rounding and allocation rules (code block) (lines at `b81e3f1`: 1575-1578)
- **Category:** cross-doc
- **Text:** "The functions live in `app/modules/pricing/domain/money.ts` ..." followed by `export type Minor = number // a safe integer number of paisa` in that file.
- **Problem:** 09 §3.8 defines Minor, toMinor and sumMinor in app/modules/platform/money.ts and has the pricing file re-export Minor, because catalog and inventory rank below pricing (03 §4.1) but handle prices. If Minor is declared in pricing as §18.2 shows, catalog and inventory would have to import from a higher-ranked module, which breaks 09's dependency rule. 09 Consistency note 7 flags only ADR-0007 for this, not the 04 code block.
- **Suggested fix:** Replace the first line of the code block with `import type { Minor } from '#modules/platform/money'` and `export type { Minor }` (re-export). Change the lead-in to 'The rounding and allocation functions live in `app/modules/pricing/domain/money.ts`, which re-exports `Minor` from `app/modules/platform/money.ts` (09 §3.8)'.

### A2-051: mulDivHalfUp and allocate do not enforce their non-negative preconditions; a negative total silently breaks 'sum === total'

- **Where:** 18.2 Rounding and allocation rules (code block) (lines at `b81e3f1`: 1587-1613)
- **Category:** money
- **Text:** "round(a × b / c), half up; a ≥ 0, b ≥ 0, c > 0" (comment only) and "Largest-remainder split of `total` by `weight`; ties to the lower id. Sum of result === total." The code checks only `W <= 0n`.
- **Problem:** BigInt division truncates toward zero. For a negative a, mulDivHalfUp is therefore not half up. For allocate(-100, three weights of 1000), shares are -33 each, left = -1, and the loop adds +1 to every row (left never reaches 0), which returns -32, -32, -32 (sum -96, not -100) with no error. A negative weight with W > 0 also breaks the one-paisa property. Rule 3 says callers pass magnitudes, but the file is 'the only place these rules are written', so the stated property should be guaranteed or refused, not silently violated.
- **Suggested fix:** In mulDivHalfUp add `if (A < 0n || B < 0n || C <= 0n) throw new RangeError('mulDivHalfUp needs a ≥ 0, b ≥ 0, c > 0')`. In allocate add `if (T < 0n || parts.some((p) => p.weight < 0)) throw new RangeError('allocate needs a non-negative total and weights')`, and a duplicate-id check (`new Set(ids).size !== parts.length`). Extend T-ORD-106 with the negative-input cases.

### A2-052: The int8 parser preload is limited to web, console and test, which leaves out the repl environment the app registers

- **Where:** 18.4 Decision (start/database_types.ts) (lines at `b81e3f1`: 1691, 1733)
- **Category:** framework-claim
- **Text:** "// start/database_types.ts, registered as a preload in adonisrc.ts for web, console and test"; 1733: "counts become numbers everywhere".
- **Problem:** AdonisJS environments are 'web' | 'console' | 'test' | 'repl' | 'unknown', and the repo registers repl_provider for ['repl', 'test']. With the preload restricted as written, `node ace repl` loads models whose bigint money columns come back as strings, so `a + b` concatenates. This is the failure §18.4 exists to prevent, and it happens in the tool an operator would use for an ad-hoc money check. It also makes the claim 'everywhere' false.
- **Suggested fix:** Change the comment to '// start/database_types.ts, registered in adonisrc.ts preloads with no `environment` restriction, so web, console, test and repl all parse int8 the same way'. In 09's tree comment (line 56), mention that the preload is unrestricted.

### A2-053: sumMinor is specified as SUM(col)::bigint without COALESCE, so an empty set returns null

- **Where:** 18.4 (Aggregates bullet and T-ARCH-013) (lines at `b81e3f1`: 1731, 1738, 2171)
- **Category:** sql-code
- **Text:** 1731: "Every sum of money is written `SUM(amount_minor)::bigint` through one helper, `sumMinor(query, column)`"; 1738: "`sumMinor` returns a `number`".
- **Problem:** SUM over zero rows returns NULL, and NULL::bigint is NULL, so the pg parser is never called and sumMinor returns null for a new shop with no ledger entries. 09 moneyJson() then throws, because it 'throws unless Number.isSafeInteger(minor)', and the balance page answers 500. 04's own Consistency note 3 (line 2171) and 09 §3.8 (line 668) already use `COALESCE(SUM(column), 0)::bigint`, so §18.4 contradicts both.
- **Suggested fix:** In §18.4, change the Aggregates bullet to 'Every sum of money is written `COALESCE(SUM(amount_minor), 0)::bigint` through one helper, `sumMinor(query, column)` ...' and extend T-ARCH-013 with 'sumMinor over zero rows returns 0'.

### A2-056: §19.2 says audit rows reference users with RESTRICT, and §2.6's exhaustive hard-delete list omits the anonymisation delete of live addresses

- **Where:** 19.2 Principle and Step 3; §2.6 (lines at `b81e3f1`: 1763, 1793, 244)
- **Category:** reference
- **Text:** 04:1763 'orders, cases, audit rows and ledger rows keep pointing at it with `RESTRICT`'; 04:1793 '`user_addresses` | All rows hard-deleted'
- **Problem:** `audit_logs` has no foreign keys by design, so audit rows do not keep the `users` row alive. Orders, support cases, `ledger_entries.created_by`, shops, memberships and the `*_by` columns do. §2.6 lists only 'archived `user_addresses` ... after their grace period' among hard deletes, and says 'Every other table is never hard-deleted by application code. The one exception is the retention purge'. `anonymizeUser` deleting non-archived addresses is application code outside that list, so a reviewer or architecture test built from §2.6 would flag it.
- **Suggested fix:** 04:1763: 'orders, support cases, ledger entries, shops, memberships and many `*_by` columns keep pointing at it with `RESTRICT` (audit rows store the id without a foreign key)'. 04 §2.6: add '`user_addresses` of a user at anonymisation (§19.2)' to the hard-delete list, next to the archived rows.

### A2-058: §19.2/§19.3 and the 04a lifecycle notes disagree in six places (memberships, stock clock, agreements, platform_settings, missing rows, user_tokens)

- **Where:** 19.2 Step 3; 19.3 rows 'Stock journal', 'Shops and their configuration', 'Seller agreements', 'Reference data'; Consistency note 10 (lines at `b81e3f1`: 1794, 1823, 1827, 1828, 1831, 2134)
- **Category:** cross-doc
- **Text:** 04:1827 'Delete configuration rows' (7 years after `closed_at`, including `shop_memberships` and `shop_category_assignments`); 04:1823 '7 years, with the orders they explain | `created_at` / `resolved_at`'; 04:1828 seller agreements 'Delete'; 04:1831 '`platform_settings` ... Never deleted; deactivated with `is_active = false`'; 04:2134 'so every table has a rule'; 04:1794 '`user_tokens`, `sessions` | Deleted'
- **Problem:** (a) 04a keeps `shop_memberships` and `shop_category_assignments` 'as long as the shop', which is forever, while §19.3 deletes them 7 years after `closed_at`. (b) The stock row names `created_at`/`resolved_at` as the clock, but its own 'with the orders they explain' and 04a §8.2/§8.3 use the order clock, 7 years after the last shop order became terminal. (c) 04a §6.1 says agreement rows are 'append-only and never deleted', while §6.4 and §19.3 delete them 7 years after closure. (d) `platform_settings` is Configuration in 04a §15.1, updated in place, with no `is_active` column. The related §1.4 Reference-class finding covers `attributes`, `category_attributes` and `brands`. (e) Some tables have no §19.3 rule: `platform_staff`, although 04a §5.4 points at §19.3 for it, and `media_assets` of kinds `shop_logo` and `shop_banner`, although note 10 claims every table has one. (f) Step 3 deletes `user_tokens`, while 04a §5.2 consumes a user's live tokens at anonymisation.
- **Suggested fix:** (a) 04a §6.2 and §6.9: 'deleted with the shop's configuration 7 years after `closed_at` (04 §19.3)'. (b) Stock row clock: 'the order's last shop order terminal (as the Orders row)'. (c) 04a §6.1: 'Agreement rows are append-only and are deleted only by the retention command, 7 years after closure, when the shop can no longer become `active`'. (d) Move `platform_settings` out of the Reference row into its own line: 'Configuration; updated in place, never deleted; history in `audit_logs`'. (e) Add rows: '`platform_staff` | Internal | while the user row exists | —' and '`media_assets` (`shop_logo`, `shop_banner`) | Public | while the shop row exists; not deleted in R1'. (f) Pick one wording, for example '`user_tokens`: consumed, then deleted in the anonymisation transaction', in both documents.

### A2-061: The §19.2 Step 4 redaction keeps recipient_phone_last4, and the queued R2 recipient_phone_hash member (IN-44) would survive it

- **Where:** 19.2 Step 4; 19.3 'Orders, fulfilment, returns' row (lines at `b81e3f1`: 1806, 1820)
- **Category:** retention-privacy
- **Text:** 04:1806 'redacts the personal members of each old order's `shipping_address` snapshot (recipient name, phone, area, street) and keeps the location codes'
- **Problem:** The snapshot also holds `recipient_phone_last4`. 04a's redaction note touches only the four `*_enc` members, so the mask survives. Together with the ward and local level it can narrow a recipient, often a third party such as a gift recipient, to a household. The queued follow-up IN-44 (A4-049) adds a keyed `recipient_phone_hash` member (R2, proposed). A keyed hash of the full number is a blind index that anyone holding BLIND_INDEX_KEY can match, so it must be redacted as well; the queued fix does not say so.
- **Suggested fix:** Step 4 and the §19.3 Orders row: 'redacts the recipient name, phone, the phone's last four digits, area and street (`recipient_name_enc`, `recipient_phone_enc`, `recipient_phone_last4`, `area_tole_enc`, `street_landmark_enc` → JSON null; also `recipient_phone_hash` once the R2 member exists) and keeps the location codes'. In 04a §11.1, say that the redaction nulls `recipient_phone_last4` too. Add the `recipient_phone_hash` redaction to the IN-44 fix when it is applied.

### A2-062: Restore replay covers anonymisations only: deletion requests and consent withdrawals made after the restore point come back undone

- **Where:** 19.2 'Backups' paragraph (lines at `b81e3f1`: 1808)
- **Category:** retention-privacy
- **Text:** 04:1808 'A restore can resurrect them, so the restore runbook replays anonymisations. ... `node ace data:replay-anonymizations` re-applies every ID in the newest list plus any logged since that list was written.'
- **Problem:** A restore returns every privacy action to its state at the restore point, not only anonymisations. Two cases are lost. A user who asked for deletion after that point is `active` again and can sign in (07 §3.12), and the request disappears from the queue that staff must clear within 30 days (AC-FR-IAM-009-4). A marketing consent withdrawn after that point is back, although 07 §5.3 says withdrawal 'takes effect immediately' (REG-26). R1 sends only transactional email, so the consent case matters from R2. The list written with each dump and the log lines carry anonymised IDs only.
- **Suggested fix:** Log `user.deletion_requested user_id=<id>` and `user.consent_withdrawn user_id=<id> channel=<email|sms>` (no personal values) next to `user.anonymize`. Write the IDs of `deactivated` users and of users with withdrawn consent into the list stored with each dump. Have the replay command, renamed `data:replay-privacy-actions` in 11 §11.5 step 7, re-apply all three: deactivate with `deletion_requested_at`, null the consent, anonymise.

### A2-067: The §19.3 Sessions row misstates how long rows live and omits the hourly purge that 07 owns (queued IN-29 changes only 04a)

- **Where:** 19.3 Sessions row (lines at `b81e3f1`: 1836)
- **Category:** cross-doc
- **Text:** 04:1836 'Until expiry: 7 days idle for customers, shorter for sellers and staff (A-23) | Last write | Delete | Session store garbage collection'
- **Problem:** The store has one `age`. Every signed-in row, seller and staff included, lives 7 days after its last write. The 12 h seller and 2 h admin idle limits are middleware checks on timestamps in `data` (04a §5.3, 07 §3.1). Rows without a signed-in user expire after 2 h. 07 §3.1 and §5.4 add the hourly `identity.purge_sessions` job (proposed) to garbage collection, and 11 §8.7 proposes a daily backstop inside `platform.retention_purge` instead. The queued IN-29 changes only 04a §5.3.
- **Suggested fix:** Row: 'Signed-in sessions of every role: 7 days after the last write (shorter idle and absolute limits are middleware checks, 07 §3.4); sessions without a signed-in user: 2 h (07 §3.1) | Last write | Delete | Store garbage collection plus the hourly `identity.purge_sessions` job (proposed, 07 §3.1)'. Ask 11 §8.7 to drop its duplicate daily backstop or name the same job.

### A2-068: 04 §19.3 rate-limit row cites the wrong limiter file and understates how long expired counters stay

- **Where:** 19.3 'Rate-limit counters' row | 19.3 Retention schedule, Rate-limit counters row (lines at `b81e3f1`: 1841)
- **Category:** framework-claim
- **Text:** 04:1841 'Until the window expires | Window start | Delete | Limiter store (`clearExpiredByTimeout`) [Verified-doc `@adonisjs/limiter` 3.0.1 `build/src/define_config.d.ts`]'
- **Problem:** clearExpiredByTimeout is declared in @adonisjs/limiter 3.0.1 build/src/types.d.ts:129 (LimiterDatabaseStoreConfig), which is what 04a §15.4 cites. define_config.d.ts, which 04 cites, has no such option. The database store passes the option to rate-limiter-flexible's RateLimiterPostgres (build/src/stores/database.js:65). Its timer runs every 5 minutes and deletes rows WHERE expire < now − 1 hour (rate-limiter-flexible 9.1.1 lib/RateLimiterPostgres.js:64-97), so a counter row stays up to about 65 minutes after its window ends, not 'until the window expires' (04:1841). Checked in the npm tarballs, because neither package is installed.
- **Suggested fix:** 04:1841 row: 'Up to about 1 hour after the window ends (the store deletes rows whose expire is more than an hour old, every 5 minutes) | Window end | Delete | Limiter store option clearExpiredByTimeout [Verified-doc @adonisjs/limiter 3.0.1 build/src/types.d.ts:129; rate-limiter-flexible 9.1.1 lib/RateLimiterPostgres.js]'.

### A2-073: 'The two reference cycles': return_requests → support_cases is a forward reference, not a cycle

- **Where:** §20.2.2 introduction and file 13 (lines at `b81e3f1`: 1899, 1915 (also ADR-0011:53))
- **Category:** reference
- **Text:** "the two reference cycles are closed with a later `ALTER TABLE`"; file 13: "(cycle 2: `return_requests` → `support_cases` → `orders`)"
- **Problem:** support_cases has no foreign key to return_requests, so there is no cycle. return_requests_case_fkey simply points at a table that a later module file creates. Calling it a cycle suggests a missing support_cases → return_requests key. The only real cycle is shops ↔ media_assets.
- **Suggested fix:** 04:1899: "… one reference cycle (shops ↔ media_assets) and one forward reference (return_requests.support_case_id to support_cases, created in the later support file) are closed with a later ALTER TABLE". File 13: "(forward reference: return_requests → support_cases)". Make the same wording change in ADR-0011 decision 1.

### A2-076: baseline_grants puts the forbid_mutation() triggers inside the role guard, so databases without dripnepal_app get no append-only trigger

- **Where:** §20.2.2 file 14 (lines at `b81e3f1`: 1916 (with 311-325))
- **Category:** migration
- **Text:** "Runtime-role grants and the append-only `REVOKE`s and triggers (§2.12). Guarded with `IF EXISTS (… 'dripnepal_app')`". §2.12: "Layer 2: even the owner role is stopped by a trigger (catches psql mistakes and migrations)".
- **Problem:** The triggers are schema objects and do not depend on any role. Created inside the guard, they are skipped on every database without dripnepal_app. That includes the local docker-compose database, where the app connects as the superuser `dripnepal`, so neither layer applies there. Code that updates ledger_entries, audit_logs or another append-only table works locally and fails only in CI or production.
- **Suggested fix:** 04:1916: "Runtime-role grants and the append-only REVOKEs, inside per-role guards. The `forbid_mutation()` triggers of §2.12 are created unconditionally, with their tables (files 4, 5, 7, 9, 10, 12, 13) or in this file outside the DO block."

### A2-078: §20.2.3 step 1 deletes models and constants that user.ts, shop.ts and two seeders still import, and omits the model rewrite and seeder deletions

- **Where:** §20.2.3 Steps, step 1 (lines at `b81e3f1`: 1932)
- **Category:** migration
- **Text:** "Delete the 26 files in `database/migrations`, the models and constants that exist only for dropped tables (`GlobalRole`, `Permission`, `ShopRole`, `ShopStaffAssignment`, `#constants/global_roles`, `#constants/permissions/*`), and the demo seeder (§20.3)."
- **Problem:** app/models/user.ts imports GlobalRole and ShopStaffAssignment, and app/models/shop.ts imports ShopRole and ShopStaffAssignment. global_role_seeder.ts and permission_seeder.ts import the deleted models and constants. If only the listed files are deleted, typecheck breaks, and db:seed in step 4 fails loading those seeders. §20.3 marks the two seeders 'Deleted', and 09 §8.1 item 2 rewrites the models in the same PR, but the step list mentions neither.
- **Suggested fix:** 04:1932: "… `#constants/permissions/*`), and every current seeder and factory as §20.3 lists. In the same PR, rewrite the remaining models against the regenerated `database/schema.ts` (09 §8.1 item 2); `user.ts` and `shop.ts` import the deleted models today."

### A2-079: §20.2.3 step 6 says pg-boss recreates its schema at start, but 04a §15.5 and 11 §6.1 install it only from the release step

- **Where:** §20.2.3 Steps, step 6 (lines at `b81e3f1`: 1937)
- **Category:** cross-doc
- **Text:** "a local `pgboss` schema is reset with `DROP SCHEMA pgboss CASCADE` if needed, and pg-boss recreates it at start."
- **Problem:** 04a §15.5 says 'pg-boss installs and migrates its schema from the release step under the migrator role'. 11 §6.1 starts the worker 'with its own migration step disabled'. After the local DROP SCHEMA, the worker would therefore not recreate the schema. Developers need the same install step that the release runs.
- **Suggested fix:** 04:1937: "… reset with `DROP SCHEMA pgboss CASCADE` if needed, then recreated by the pg-boss install step that the release step runs (11 §6.1), run locally; the worker never creates it."

### A2-081: The recipe for removing a CHECK value cannot work on the nine append-only tables

- **Where:** §20.2.4 (after the CHECK example) (lines at `b81e3f1`: 1961)
- **Category:** edge-case
- **Text:** "Removing a value is the reverse: stop writing it in release N, migrate existing rows in batches by job, then replace the CHECK in release N+1."
- **Problem:** On the append-only tables (inventory_movements.kind and vendor reason codes, ledger_entries.entry_type, order_events.type, shipment_events and the review decisions) existing rows cannot be migrated. dripnepal_app has no UPDATE on them, forbid_mutation() blocks every role, and rewriting them would falsify records kept 7 years. An implementer following the recipe either fails or disables the trigger to rewrite history. A VALIDATE of the narrower CHECK would then fail on the old rows.
- **Suggested fix:** Add to 04:1961: "On the append-only tables of §2.12, rows are never migrated. The retired value stays in the CHECK and in the TypeScript array (marked legacy), and only code stops writing it."

### A2-082: The active shop factory state cannot insert the shop as active; §20.3 omits the insert order and approval columns that 04a §6.1 says it describes

- **Where:** §20.3 Factories (lines at `b81e3f1`: 1987)
- **Category:** edge-case
- **Text:** "… a shop factory state `active` also inserts a `shop_agreements` row, because the trigger of INV-18 would otherwise reject it"
- **Problem:** shops_require_agreement fires BEFORE INSERT when NEW.status = 'active'. The agreement row cannot exist yet, because its FK needs the shop row first. A factory that inserts the shop as active and adds the agreement afterwards is therefore always rejected. shops_approval_check also requires approved_at and approved_by. 04a §6.1 states the correct order (pending_review, then the agreement, then an update to active) and cites '[04 §20.3]' for it, but §20.3 does not contain it.
- **Suggested fix:** 04:1987: "… a shop factory state `active` inserts the shop as `pending_review`, then its `shop_agreements` row, then updates it to `active` with `approved_at` and `approved_by` (a staff user), because the INV-18 trigger runs before insert and `shops_approval_check` needs both columns (04a §6.1)."

### A2-085: schema:generate itself has no production check; only migration:run and rollback skip it in production

- **Where:** §20.3 Schema generation (last bullet) (lines at `b81e3f1`: 2003)
- **Category:** framework-claim
- **Text:** "`schema:generate` does not run in production (`app.inProduction`), so the committed `database/schema.ts` must always match the migrations"
- **Problem:** The installed schema:generate command checks only `schemaGeneration.enabled === false`. The `app.inProduction` check is in migration:run's generateSchemaClasses(). The conclusion still holds, because production never calls the generator automatically. As worded, though, the claim about the command is false.
- **Suggested fix:** 04:2003: "`migration:run` and `migration:rollback` skip schema generation in production (`app.inProduction`, run.js:67), and the release step never calls `schema:generate`, so the committed `database/schema.ts` must always match the migrations; …"

### A2-089: The 'special counter codes are not wards' claim (§21.4, 04a §9.3, register VX-10) is contradicted by the cited notice: 1121415 is Biratnagar ward 15's code

- **Where:** §21.4 Import procedure step 4 (also 04a §9.3 and risks-and-open-decisions.md VX-10) (lines at `b81e3f1`: 2102)
- **Category:** reference
- **Text:** Special counter codes in the notice (for example `1121415`) are not wards and are not imported.
- **Problem:** The notice's row 18 is 'रानी काउन्टर, विराटनगर म.न.पा.' (Rani counter, Biratnagar Metropolitan City). It gives the local level as 'विराटनगर-१५, मोरङ' (Biratnagar-15, Morang), no office code ('-'), and the ward code '११२१४१५'. The main list gives Biratnagar (11214) wards 1121401 to 1121419, so 1121415 is ward 15's own code, and the 04a §5.5 formula generates it (tested: 11214 with ward 15 gives 1121415). The counter reuses the code of the ward it sits in; it is not a separate non-ward code. 04a §9.3 gives this misreading, labelled [Verified-doc], as its reason for deriving the postal code, and VX-10 repeats it. Deriving the code is still right, but the stated fact is false.
- **Suggested fix:** 04 §21.4 step 4: 'The Biratnagar notice also lists service counters. They have no office code and use the ward code of the ward they are in (for example the Rani counter at Biratnagar-15, 1121415). They are not local levels and are not imported.' 04a §9.3: 'The ward's 7-digit postal code is code || lpad(ward_no::text, 2, '0'), so customers are never asked for it; counters listed in Nepal Post notices reuse their ward's code.' Register VX-10: replace 'Some codes are special counters, not wards' with 'Counters (for example Rani, Biratnagar-15) reuse their ward's code.'

### A2-090: §21.5 says 'nothing collected at the door', which is false for COD and misstates the Directive s8(3) rule as 05 §3.3 gives it

- **Where:** §21.5 Delivery zones (lines at `b81e3f1`: 2113)
- **Category:** cross-doc
- **Text:** This is the two-zone model of A-27: one flat fee per shop per zone, fixed at checkout, with nothing collected at the door (Directive 2082 s8(3), 05 §3.3).
- **Problem:** COD is the R1 payment method, and the courier collects the whole grand total at the door (05 §6.5, `collected`). The rule that 05 §3.3 rule 6 and 04a §9.7 cite from s8(3) is narrower: nothing may be collected beyond the price and the transport cost fixed before the sale, so there is no COD fee and no fee change at the door. Read literally, §21.5 contradicts COD and misstates the rule it cites. 00 A-27 has the milder 'nothing charged at the door'.
- **Suggested fix:** Replace with: 'This is the two-zone model of A-27: one flat fee per shop per zone, fixed at checkout. At the door the courier collects only the COD total shown at checkout, with no COD fee and no fee change (Directive 2082 s8(3), 05 §3.3 rule 6).'

### A2-091: Four 04 Consistency-note statements are false or incomplete: note 6, note 10, and 'For other documents' items 7 and 10

- **Where:** Consistency notes for editor: note 6, note 10, For other documents items 7 and 10 (lines at `b81e3f1`: 2130, 2134, 2175, 2178)
- **Category:** reference
- **Text:** Note 6: 'No data-model change in any document; a wording item for 05 remains below.' Note 10: '§19.3 also gained rows for shops, catalog and reference data, so every table has a rule.' Item 10: 'The §2.6 hard-delete list already covers `slug_redirects` through the §19.3 retention exception.' Item 7: 'Those introduced in 04: … T-CAT-101 to T-CAT-107 … Proposed in 04a and possibly colliding: … T-ORD-101/102/103 … (see the 04a list, item 9)'
- **Problem:** (a) Note 6 has been overtaken. Since audit 1, 05 §6.4 proposes payments.is_late_capture and adding AND NOT is_late_capture to payments_one_live_gateway_attempt_key, which is a data-model change for 04a §12.1 and 04 §16.3. The body fixes are queued (IN-10, IN-11, IN-24, IN-25); the note is not. Its 'wording item for 05' is also done (see the stale-items finding). (b) Note 10: platform_staff has no §19.3 row, although 04a §5.4 defers its retention to §19.3. (c) Item 10: application code also hard-deletes slug_redirects outside retention. The slug-change action deletes the redirect row when an entity is renamed back to one of its own old slugs, yet §2.6 still says 'Every other table is never hard-deleted by application code'. 2F1 reported the §2.6 body; this is the note that calls it covered. (d) Item 7's lists are not usable for doc 10. 04a also uses T-CAT-105, T-CAT-108, T-IAM-104, T-IAM-105, T-IAM-108, T-IAM-109, T-IAM-110, T-MED-102 and T-MED-103, none of them listed. 'T-CAT-101 to T-CAT-107' credits 04 with T-CAT-105, which only 04a uses. 04a no longer uses T-ORD-103. '(see the 04a list, item 9)' points at the 'For 04a' list, which says none remain.
- **Suggested fix:** Note 6: replace 'No data-model change in any document; a wording item for 05 remains below' with 'Superseded by 05 §6.4: payments.is_late_capture and AND NOT is_late_capture in the predicate are proposed for 04a §12.1 and §16.3 (audit 2 incoming IN-10, IN-11, IN-24, IN-25).' Note 10: add a §19.3 row 'Platform staff | platform_staff | Internal | While the user row exists; history in audit_logs (04a §5.4)', or drop 'so every table has a rule'. Item 10: replace the slug_redirects sentence with '§2.6 still needs slug_redirects (rename-back delete, 04a §6.10) and product_listings (row deleted when a product stops being visible, 04a §7.12) in its hard-delete list.' Item 7: regenerate both lists by grepping '(proposed)'. 04: T-ARCH-010…014, T-CAT-101…104, T-CAT-106, T-CAT-107, T-SHOP-101…103, T-IAM-103, T-IAM-106, T-IAM-107, T-IAM-111, T-ORD-101…106, T-MED-101, T-PAY-101, T-LED-101…103, T-CART-101. 04a adds: T-ADM-102, T-ADM-103, T-CART-102, T-CAT-105, T-CAT-108, T-FUL-101, T-IAM-104, T-IAM-105, T-IAM-108, T-IAM-109, T-IAM-110, T-INV-101, T-INV-102, T-LED-104, T-MED-102, T-MED-103, T-NOT-101, T-ORD-107, T-PAY-102, T-RET-101, T-SEC-101, T-SHOP-104…110, T-ARCH-015. Replace '(see the 04a list, item 9)' with '(note 30)'.

### A2-092: 04 Consistency notes still list as open follow-ups that 05, 07, 09, 11, openapi.yaml and the register have already resolved

- **Where:** Consistency notes for editor: notes 27, 33, 35; For other documents items 2, 3(b), 5, 6, 8, 9, 11 (lines at `b81e3f1`: 2152, 2158, 2160, 2170, 2171, 2173, 2174, 2176, 2177, 2179)
- **Category:** reference
- **Text:** Item 6: 'the database role names dripnepal_app (§2.12) and the migrator role are placeholders that 07 owns, along with key custody…'. Item 8: 'the incident runbook should include TRUNCATE sessions…; the restore runbook must run node ace data:replay-anonymizations…'. Item 11: '§6.1 auto-complete and §6.6 return creation should read it'. Note 35: 'The register still needs to widen VX-03 or add a VX'.
- **Problem:** The final consistency review would redo work that is already done. (1) Item 2: OD-01 now says 26 files (register note 15), and VX-03 was widened to cover the Advertisement (Regulation) Act 2076 (register note 9); note 35 repeats the second point. (2) Item 3(b): 05 §4.8 now states the needs_review lookup and the 409. (3) Item 5: 09 §2.3 item 5 and 11 §8.7 already adopt platform.retention_purge with the 04 scope; only the 03 §9 row is still narrow. (4) Item 6: 07 §4.10 defines dripnepal_migrator, dripnepal_app and dripnepal_readonly, and 07 §5.5 owns custody of both keys. (5) Item 8: 11 §10.9 has TRUNCATE sessions, the 11 §11.5 restore paths run data:replay-anonymizations, and 11 §6.1 installs pgboss from the release step; only the M0 spike T-ARCH-004 remains. (6) Item 11: 05 §6.1 and §6.6 read return_window_ends_at, and 05 note 18 is closed. (7) Notes 27 and 33 point to 'For other documents' for fixes that item 10 records as done, and note 33's 'state only the child rule' is now false. (8) Item 9 says openapi.yaml 'must reflect the added columns', but under the foundation-contract rule operations and their fields enter openapi.yaml only in the implementing PR. Still open and correct: items 3(a), 3(c), 4, 7 and the 03 part of item 5.
- **Suggested fix:** Move to 'Resolved', each with the place that resolved it: item 6 → '07 §4.10 names the three roles; 07 §5.5 owns key custody'; item 8 → '11 §10.9, §11.5 and §6.1; the pg-boss Knex transactional-send spike stays T-ARCH-004 in 03'; item 11 → '05 §6.1, §6.6 and 05 note 18'. Delete item 3(b). Reword item 2 to 'risks: the OD-04 deadline (see the OD-04 finding); nothing left for OD-01 or the Advertisement Act (register notes 15 and 9)'. Reword item 5 to '03 §9: the platform.retention_purge row still lists only tokens, addresses and invitations; 09 §2.3 and 11 §8.7 already use the 04 scope'. Note 35: 'VX-03 was widened in A4.4 (register note 9)'. Notes 27 and 33: drop the pointers to 'For other documents' and say 'done (item 10)'. Item 9: '06 must reflect the added columns; openapi.yaml gains them in each operation's implementing PR (foundation scope)'.

## Data Dictionary: Tables (§5–§15)

Findings located in [04a-data-dictionary-tables.md](../04a-data-dictionary-tables.md).

### A2-105: Category listing: the LIKE prefix query is never served in index order, even for a leaf; price sorts are not index-served

- **Where:** §7.12 product_listings Indexes; 04 §17.2; 06 §6.1 | §7.12 product_listings indexes | §7.12 product_listings, Indexes (lines at `b81e3f1`: 04a:975; 04:1416; 06:359, 378 | 04a:975 | 975)
- **Category:** index-query
- **Text:** 04a:975 "`WHERE category_path LIKE '/clothing/tops/%' ORDER BY published_at DESC, product_id LIMIT 24 OFFSET :o` ... For a leaf the scan is already in order"; 06:359 "the chosen sort key, then `product_id` ..., served by `product_listings_category_idx`/`product_listings_shop_idx`"
- **Problem:** 04a §7.12 (975) and 04 §17.2 (1416) say that for a leaf category the scan is already in order. But a LIKE 'prefix%' becomes a range condition on category_path. Paths end in '/', so even a leaf needs LIKE '/clothing/tops/t-shirts/%'. PostgreSQL returns ORDER BY published_at DESC, product_id from the index only when the leading column is fixed by equality; with a range it reads every matching row and sorts. Tested on PG 18.6 with a 10,000-listing leaf: a Bitmap Index Scan plus a top-N heapsort, while equality gives an ordered Index Only Scan that stops after 24 rows. 06 §6.1 (359, 378) also says the chosen sort key is index-served, but price_asc, price_desc and relevance always sort in memory.
- **Suggested fix:** 04a:975 and 04:1416: 'Leaf category (known from the cached tree): WHERE category_path = :path ORDER BY published_at DESC, product_id; equality works on text_pattern_ops, so the scan is in order. Parent category: WHERE category_path LIKE :prefix || '%', followed by a top-N sort (at most a few thousand rows at A-03 scale).' 06 §6.1: 'newest is served by the category and shop indexes; price and relevance sorts sort the selected rows in memory (A-03 bound).'

### A2-106: 06 §6.3 admin queue sorts do not match the 04a indexes: shop applications by created_asc instead of submitted_at, and no deletion-queue sort for listUsers

- **Where:** §6.1 shops Indexes note; 04 §17.3; 06 §6.3 | §5.1 users indexes; §6.1 shops (submitted_at) (lines at `b81e3f1`: 04a:272, 324; 04:1534; 06:389 | 04a:87, 272, 324; 06:389-390; 04:1534; 02:643)
- **Category:** cross-doc
- **Text:** 04a:272 `submitted_at` "Set at application and at each resubmission; orders the review queue"; 04a:324 "`WHERE status = 'pending_review' ORDER BY submitted_at`"; 06:389 "`listShopApplications`, `listShops` ... `created_desc` (applications `created_asc`)"
- **Problem:** 04a §6.1 (272, 324) and 04 §17.3 (1534) queue shop applications by submitted_at, so a resubmitted application takes its turn by resubmission time. 06 §6.3 (389) sorts listShopApplications created_asc, so a resubmitted application jumps ahead of first-time applicants; the cursor key and the future (status, submitted_at) index both assume submitted_at. 04a §5.1 (87) indexes the deletion-request queue (users_deletion_queue_idx), but 06 gives listUsers only created_desc (390). Staff therefore see the queue by signup date, and the index is never used.
- **Suggested fix:** 06 §6.3: sort listShopApplications submitted_asc (tie-breaker id, cursor [submitted_at, id]) instead of created_asc. Add a listUsers sort deletion_requested_asc (tie-breaker id, only with status = deactivated, served by users_deletion_queue_idx). 04 and 04a stay as written.

### A2-107: Category subtree move statement rewrites path but not depth or parent_id, and inserts a slug redirect even when the slug is unchanged

- **Where:** §7.1 categories, seeder-enforced rules | §7.1 categories; §7.4 effective rules query (lines at `b81e3f1`: 04a:627-628, 612, 586; 03:506 | 627-628, 698-706)
- **Category:** sql-code
- **Text:** 'a slug or parent change rewrites the paths of the whole subtree in one statement (`UPDATE categories SET path = :new || substr(path, length(:old) + 1) WHERE path LIKE :old || '%'`), inserts a `slug_redirects` row and queues `catalog.rebuild_listings`.'
- **Problem:** 04a §7.1 (627-628) gives UPDATE categories SET path = ... WHERE path LIKE :old || '%' for a parent change. A move changes the level, but depth is left stale. A move to or from the top level violates categories_depth_check (depth BETWEEN 1 AND 4 AND (parent_id IS NULL) = (depth = 1)) unless parent_id and depth change in the same statement. The descendants keep their old depths, and the §7.4 effective-rules query (698-706) picks the winning row by depth ('deepest row wins'), so a leaf and its new parent can tie and DISTINCT ON picks either. Nothing ties depth to path. Also, category URLs are /c/{slug}, so a move that changes only the parent changes no URL. Inserting a redirect then records the current slug as an old slug, and a second move of the same category fails with 23505 on slug_redirects_pkey.
- **Suggested fix:** 04a §7.1: UPDATE categories SET path = :new || substr(path, length(:old) + 1), depth = depth + (:new_depth - :old_depth), parent_id = CASE WHEN id = :moved_id THEN :new_parent_id ELSE parent_id END WHERE path LIKE :old || '%'. The move 'inserts a slug_redirects row only when the slug changes'. Optionally add the single-row CHECKs categories_depth_path_check CHECK (depth = char_length(path) - char_length(replace(path, '/', '')) - 1) and categories_path_slug_check CHECK (right(path, char_length(slug::text) + 2) = '/' || slug::text || '/').

### A2-108: categories_slug_check accepts consecutive hyphens that categories_path_check rejects

- **Where:** §7.1 categories, Keys and constraints (lines at `b81e3f1`: 04a:624, 626 | 624, 626)
- **Category:** constraint
- **Text:** `categories_slug_check CHECK (slug::text ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')` and `categories_path_check CHECK (path ~ '^/([a-z0-9]+(-[a-z0-9]+)*/)+$')`.
- **Problem:** In 04a §7.1 (624, 626), a slug such as t--shirts passes the slug CHECK (the shop slug pattern of 04 §2.8), but its path /t--shirts/ fails the path CHECK with 23514 (tested on PG 18.6). A seeder therefore fails on a slug the documented rule allows.
- **Suggested fix:** Use one segment rule for both. Either categories_slug_check CHECK (char_length(slug::text) BETWEEN 3 AND 40 AND slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)\*$'), a pattern with no '?' (see the knex placeholder group), or relax categories_path_check to '^/([a-z0-9](\?:[a-z0-9-]{1,38}[a-z0-9])/)+$'.

### A2-109: Order address snapshot copies Nepali province and district names but not the local level's Nepali name

- **Where:** §11.1 orders, shipping_address snapshot (lines at `b81e3f1`: 04a:1618-1627, 1635 | 1610-1632)
- **Category:** schema
- **Text:** The snapshot has province_name_en/ne, district_name_en/ne and local_level_name_en only; "Names are copied, so an order still prints the local level's old name after a renaming."
- **Problem:** The 04a §11.1 schema-1 snapshot (1610-1635) copies province and district names in both languages, but the local level only in English. local_levels.name_ne is NOT NULL (§9.3), and 08 says the R2 Nepali UI shows name_ne for location names. The local level is the level most likely to be renamed or merged (04a §9 Changes). A Nepali order page or receipt would then read the live row and show the wrong name after a merger, which breaks INV-09. Adding the member later leaves every older order without it.
- **Suggested fix:** Add a local_level_name_ne member (for example 'काठमाडौँ महानगरपालिका') to the schema-1 snapshot, copied at checkout from local_levels.name_ne like the province and district names, and state that every location level is copied in both languages.

### A2-110: order_items allows tax-exclusive lines whose tax has no place in the shop_orders or orders totals

- **Where:** 11.3 order_items (tax_inclusive, order_items_total_check); 04 §16.3 INV-10; 04 §18.2 rule 6 | §16.3 INV-10 SQL (lines at `b81e3f1`: 04a 1805, 1836-1840, 1753-1754; 04 1186-1189, 1573 | 1185-1189, 1197-1198, 1204-1205)
- **Category:** constraint
- **Text:** `order_items_total_check CHECK (line_total_minor = line_subtotal_minor - discount_minor + CASE WHEN tax_inclusive THEN 0 ELSE tax_minor END)`; `shop_orders_totals_check CHECK (total_minor = items_subtotal_minor + shipping_fee_minor - discount_minor)`; §18.2 rule 6: 'prices are tax-inclusive'.
- **Problem:** tax_inclusive is a free boolean with default true and no CHECK (04a §11.3:1805, 1836-1840; 04 §16.3 INV-10:1185-1205). For a line with tax_inclusive = false and tax_minor > 0, line_total_minor includes the tax. But shop_orders.total_minor, and so the COD amount and the payment allocation, is items_subtotal − discount with no tax term (04a 1753-1754). Σ line_total then no longer equals total − shipping. The cumulative refund A(c) would refund tax the customer never paid, and 05 §7.3's assertion cod_collected = sale + shipping would abort every delivery posting. §18.2 rule 6 and A-16 say prices are always tax-inclusive, so R1 never writes such a line; the gap is latent.
- **Suggested fix:** Until OD-11/OD-26 decide tax-exclusive pricing, add CONSTRAINT order_items_tax_inclusive_check CHECK (tax_inclusive) to 04a §11.3 and to the INV-10 copy in 04 §16.3, with the note 'tax-exclusive lines need tax_total_minor on shop_orders and orders and a changed totals CHECK, added by expand/contract (§20.2.4)'.

### A2-111: ledger_entries does not tie refund_id and order_item_id to the entry's shop_order_id, although the composite targets exist

- **Where:** §13.1 ledger_entries (§2.5 ownership chains) | §13.1 ledger_entries, Keys and constraints (lines at `b81e3f1`: 04a:2483-2488; 04a:1825, 04a:2365 | 2483-2488, 2365)
- **Category:** constraint
- **Text:** 04a:2483-2488 composite FKs `(shop_order_id, shop_id)`, `(order_item_id, shop_id)`, `(refund_id, shop_id)` only.
- **Problem:** 04a §13.1 (2483-2488) declares independent FKs. A refund or commission_reversal entry can therefore carry refund R of shop order SO1 together with shop_order_id SO2 of the same shop, and an entry can name an order line of another shop order (tested on PG 18.6: the insert was accepted). Shop balances stay right. But the 05 §7.6 held filter and the statements group entries by shop_order_id, and the §7.12 checks compare amounts per refund only, so such an entry is held or released with the wrong shop order and nothing detects it. The §2.5 pattern ('reference the pair') is applied everywhere else, and the targets refunds_id_shop_order_id_key and order_items (id, shop_order_id) already exist (04a:1825, 2365).
- **Suggested fix:** 04a §13.1: add CONSTRAINT ledger_entries_refund_shop_order_fkey FOREIGN KEY (refund_id, shop_order_id) REFERENCES refunds (id, shop_order_id) ON DELETE RESTRICT and CONSTRAINT ledger_entries_order_item_shop_order_fkey FOREIGN KEY (order_item_id, shop_order_id) REFERENCES order_items (id, shop_order_id) ON DELETE RESTRICT. MATCH SIMPLE skips rows where either column is null. Update the 'target for' comments on refunds_id_shop_order_id_key and on the order_items key.

### A2-112: shops.logo_media_id and banner_media_id FKs do not check the asset kind, so a KYC document can be stored as a public logo

- **Where:** §6.1 shops keys (applies 04 §2.5 nullable composite references) (lines at `b81e3f1`: 04a:282; 04a:1050; 04a:1010; 04:225)
- **Category:** constraint
- **Text:** 04a:282 "`shops_logo_media_fkey FOREIGN KEY (logo_media_id, id) REFERENCES media_assets (id, shop_id)` … That the asset is of the right kind and `ready` is checked by `updateShopProfile`." 04a:1050 (product_media) "A KYC document, which may be a citizenship card, can never be placed in a public gallery, even by a bug in a new endpoint."
- **Problem:** The logo and banner are public (sensitivity Public), yet only the application stops a `kyc_document` of the same shop, such as a citizenship card, from being referenced as the logo. The media module applies a stronger database rule to product images, which matches the §2.5 rationale that one missed check in a new action should not be enough. The kind-carrying unique key (id, shop_id, kind) already exists.
- **Suggested fix:** 04a §6.1: add constant columns `logo_media_kind text NOT NULL DEFAULT 'shop_logo' CHECK (logo_media_kind = 'shop_logo')` and `banner_media_kind text NOT NULL DEFAULT 'shop_banner' CHECK (banner_media_kind = 'shop_banner')`. Declare `shops_logo_media_fkey FOREIGN KEY (logo_media_id, id, logo_media_kind) REFERENCES media_assets (id, shop_id, kind) ON DELETE RESTRICT`, and the banner key likewise. MATCH SIMPLE still allows a null logo. `media_assets_id_shop_id_key` can then be dropped if nothing else uses it.

### A2-113: An R2 coupon capped at the eligible subtotal can make a shop order total 0, which the payments/payment_allocations CHECKs (> 0) reject

- **Where:** 12.1 payments, 12.2 payment_allocations vs 05 §3.4 rule 1 and 04 §18.3.3 (lines at `b81e3f1`: 04a 1445, 1457, 2190, 2259; 05 280)
- **Category:** edge-case
- **Text:** 05 §3.4 rule 1: 'D = min(coupon amount, W) ... A fixed-amount coupon larger than the eligible subtotal therefore discounts it to zero'; 04a: `fee_minor` '`0` means free delivery to that zone'; `payments_amount_check CHECK (amount_minor > 0)`; `payment_allocations_amounts_check CHECK (amount_minor > 0 ...)`.
- **Problem:** If every line of a shop is eligible, D = W, and the shop's zone fee is 0, that shop order's total_minor is 0. placeOrder must then insert a COD payment (one per shop order) or a gateway allocation with amount 0, which fails with 23514. If the whole order is 0, the gateway payment fails too. Skipping the payment also breaks the ledger, because 05 §7.3 posts the delivery group, including the platform-funded gross `sale`, only when the payment is collected or captured. 05 §3.4 records these R2 rules 'so the R1 schema already fits', but for this case it does not.
- **Suggested fix:** Record one rule in 05 §3.4 and reflect it in 04 §18.3.3. Option (a): the coupon is capped so every shop order and the order keep at least 1 paisa payable, D = min(coupon, W - 1) per affected shop order. Option (b): a zero-total shop order gets no payment and no allocation, and 05 §7.3 posts its delivery group on `delivered` alone (with cod_cash_held 0). Add T-CHK-011 cases for a free-shipping shop fully covered by the coupon.
- **Owner decision needed:** In R2, may a platform coupon bring a shop order (or the whole order) to Rs 0? If yes, how is such a shop order settled and posted without a payment row; if no, should the coupon be capped to leave at least 1 paisa (or a minimum payable) per shop order?

### A2-114: The 12-month notification_deliveries purge has no index; every other daily purge has one

- **Where:** §14.3 notification_deliveries Indexes; 04 §17.2 (lines at `b81e3f1`: 04a:2865-2869; 04:1517-1519, 1843)
- **Category:** index-query
- **Text:** 04a:2869 "Kept 12 months, then deleted by `platform.retention_purge` (proposed)"; the only created_at index is `notification_deliveries_unsent_idx (created_at) WHERE status IN ('queued','failed')`
- **Problem:** The purge `DELETE FROM notification_deliveries WHERE created_at < now() - interval '12 months'` mostly targets `sent` rows, which are outside the partial index. It therefore runs as a daily sequential scan of the table: several emails per order, so about 1–1.5 million rows at the A-02 10x load. The other purges (tokens, archived addresses, carts, idempotency keys) each have a named index and a §17.2 row; this one has neither.
- **Suggested fix:** Add `notification_deliveries_created_idx ON notification_deliveries (created_at)` to 04a §14.3 with the query "`platform.retention_purge`: `DELETE … WHERE created_at < now() - interval '12 months'` in batches of 1,000". Add the matching row to 04 §17.2. With it, `notification_deliveries_unsent_idx` could be dropped, because monitoring can use the new index with a status filter.

### A2-115: 04a §10.1 says 04 §17.1 rule 5 proposes fillfactor 80 for carts; rule 5 says the opposite

- **Where:** §10.1 carts "No fillfactor setting" (lines at `b81e3f1`: 04a:1518; 04:1359)
- **Category:** reference
- **Text:** 04a:1518 "[04 §17.1] rule 5 proposes `fillfactor = 80` for `carts` as well. It is not applied"
- **Problem:** 04 §17.1 rule 5 (04:1359) now says "`carts` is not: every cart write changes indexed columns (`expires_at`, `updated_at`), so its updates can never be HOT". The 04a sentence describes an old version of rule 5, and a reader looking for the proposal will not find it.
- **Suggested fix:** 04a:1518: "**No `fillfactor` setting** (as [04 §17.1] rule 5 says). Every cart mutation changes `expires_at` and `updated_at`, ..."

### A2-116: OD-04 deadline: 04 note item 2 and 04a §15.1 say 'before M7', but the register (owner) needs the commission rate at M2 exit for the seller agreement

- **Where:** 04a §15.1 platform_settings, default_commission_rate_bp row; 04 Consistency notes, For other documents item 2 (lines at `b81e3f1`: 04a:2894; 04:2170)
- **Category:** cross-doc
- **Text:** 04a: '[Open OD-04]; placeholder until decided, must be confirmed before M7'. 04 note item 2: 'OD-04 (`default_commission_rate_bp` placeholder 1000, before M7)'
- **Problem:** The register owns OD deadlines. For OD-04 it says: 'M2 exit (rate, in the seller-agreement text); M5 code (basis: placeOrder step 9 writes the commission snapshot).' Its M2 row adds that no vendor accepts an agreement until OD-04, OD-05 and OD-11 are decided. 00 §7.2 agrees ('rate in the M2 seller agreement'). Under the 04a wording, the seeded 10% placeholder could still be in place when vendors accept agreements at M2.
- **Suggested fix:** 04a §15.1 row: '[Open OD-04]; placeholder until decided. The rate must be decided before the seller-agreement text is final (M2 exit), and the basis before the first M5 placeOrder PR (register OD-04).' Change 04 note item 2 to 'OD-04 (default_commission_rate_bp placeholder 1000; rate by M2 exit, basis by M5)'.

### A2-117: 04a §5.2 token invalidation rule differs from the 07 §3.8 per-purpose table

- **Where:** §5.2 user_tokens, Lifecycle and retention (lines at `b81e3f1`: 04a:128; 07:720-722; 04:1794)
- **Category:** cross-doc
- **Text:** 'All live tokens of a user are consumed when the password or email changes, and at suspension or anonymisation.'
- **Problem:** 07 §3.8 (owner of token rules) invalidates an email_verification token on a newer token, email change, suspension or anonymisation, but not on a password change or reset; a password change invalidates only password_reset and mfa_enrollment tokens, and mfa_enrollment also on revokePlatformStaff. At anonymisation 04 §19.2 deletes the tokens rather than consuming them. Following 04a, a pending user who resets a forgotten password loses their verification link.
- **Suggested fix:** Replace the sentence with: 'Live tokens are invalidated per purpose as 07 §3.8 lists; anonymizeUser deletes them (04 §19.2).'

### A2-118: inventory_movements retention says the command deletes rows; deleting breaks the journal sums, 04 §19.3 plans compaction, and the clocks differ

- **Where:** §8.3 and §8.2 Lifecycle and retention (lines at `b81e3f1`: 04a:1190, 1222-1239, 1272; 04:1823; 05:709)
- **Category:** retention-privacy
- **Text:** §8.3 'Retained for 7 years with the order records they explain ... Only the retention maintenance command deletes rows'; §8.2 'Retained with the order record, 7 years after the order's last shop order became terminal'.
- **Problem:** on_hand = Σ on_hand_delta and reserved = Σ reserved_delta hold only over the whole journal (05 §5.1), so deleting old movements makes the daily drift check flag every affected variant. 04 §19.3, the owner of the schedule, says 'Compaction into a checkpoint movement per variant' instead, which needs a kind and reference rule that inventory_movements_kind_check and inventory_movements_reference_check do not have. 04 §19.3's clock is created_at / resolved_at, 04a §8.2's the order's last terminal shop order.
- **Suggested fix:** 04a §8.3: 'Never deleted row by row; after the retention period old movements are compacted into one checkpoint movement per variant (04 §19.3, designed when the table passes 10 million rows, not built in R1), which adds a kind to inventory_movements_kind_check and its reference rule.' Use one clock in 04 §19.3 and 04a §8.2/§8.3.

### A2-119: shop_payout_accounts.branch_name has no API input

- **Where:** §6.7 shop_payout_accounts vs 06 §13.5 replacePayoutAccount (lines at `b81e3f1`: 04a:508; 06:780)
- **Category:** cross-doc
- **Text:** '`branch_name` | text | yes | Bank branch, when the bank needs it for transfers'
- **Problem:** 06 replacePayoutAccount (owner of the operation fields) takes method, account_name, bank_name, account_number and password; no operation writes branch_name, so the column is always null and finance lacks the branch that the note says some banks need for transfers.
- **Suggested fix:** Add `branch_name?` (2–100 characters, bank_transfer only) to 06 §13.5 replacePayoutAccount with `shop_payout_accounts_branch_name_check CHECK (branch_name IS NULL OR (method = 'bank_transfer' AND char_length(branch_name) BETWEEN 2 AND 100))`, or drop the column.

### A2-120: FK-target comments on the shop_orders keys omit most of their referencing tables

- **Where:** §11.2 shop_orders, Keys and constraints (lines at `b81e3f1`: 04a:1730-1731)
- **Category:** reference
- **Text:** "shop_orders_id_shop_id_key UNIQUE (id, shop_id), -- target for §11.3, §11.5, §11.7, §12.4, §13.1"; "shop_orders_id_order_id_key UNIQUE (id, order_id), -- target for §11.3, §11.4, §12.1, §12.2"
- **Problem:** (id, shop_id) is also referenced by support_cases (§14.1). (id, order_id) is also referenced by return_requests (§11.7), refunds (§12.4) and support_cases (§14.1). A reviewer who relies on these lists, for example when changing a key, misses four foreign keys.
- **Suggested fix:** Change the comments to "-- target for §11.3, §11.5, §11.7, §12.4, §13.1, §14.1" and "-- target for §11.3, §11.4, §11.7, §12.1, §12.2, §12.4, §14.1".

### A2-121: local_levels type counts cite the Nepal Post list, which cannot give the metropolitan and sub-metropolitan split

- **Where:** §9.3 local_levels, type column (lines at `b81e3f1`: 04a:1341)
- **Category:** reference
- **Text:** "metropolitan, sub_metropolitan, municipality, rural_municipality (6 / 11 / 276 / 460 [Verified-doc Nepal Post list above])"
- **Problem:** 04 §21.4 says the Nepal Post PDF has only the "R.Mun." and "Mun." suffixes, and that the 6 metropolitan and 11 sub-metropolitan cities are taken from MoFAGA's list. The 6/11 split is therefore not verified by the cited source.
- **Suggested fix:** Cite "[Verified-doc Nepal Post list for 276 + 460 by suffix; MoFAGA <https://mofaga.gov.np/local-contact/dcc-prov-1> for the 6 metropolitan and 11 sub-metropolitan cities; 04 §21.4]".

### A2-122: Several text columns in 04a §9-§11 have no length CHECK, against 04 §2.8

- **Where:** §9.2 districts, §9.3 local_levels, §9.4 delivery_zones, §11.1 orders, §11.2 shop_orders, §11.3 order_items (lines at `b81e3f1`: 04a:1314, 1340, 1372-1373, 1602, 1716, 1793, 1795)
- **Category:** constraint
- **Text:** 04:262 "Strings are text with a named length CHECK rather than varchar(n)".
- **Problem:** districts.name_en/name_ne, local_levels.name_en/name_ne, delivery_zones.name_en/name_ne, orders.customer_email_snapshot, shop_orders.delivery_zone_code_snapshot, order_items.brand_name_snapshot and order_items.category_path_snapshot have no length CHECK. provinces (§9.1) and the other snapshot columns do. An oversized seeder value or snapshot is accepted silently, and the Vine and constraint-map conventions have nothing to mirror.
- **Suggested fix:** Add `districts_name_check`, `local_levels_name_check` and `delivery_zones_name_check` (`char_length(name_en) BETWEEN 2 AND 80 AND char_length(name_ne) BETWEEN 1 AND 80`, name*ne nullable for zones). Add `orders_customer_email_snapshot_check (customer_email_snapshot IS NULL OR char_length(customer_email_snapshot) BETWEEN 3 AND 254)`, `shop_orders_zone_snapshot_check (delivery_zone_code_snapshot ~ '^[a-z]a-z0-9*]{1,31}$')`, and extend order_items_snapshot_check with `char_length(category_path_snapshot) BETWEEN 1 AND 300 AND (brand_name_snapshot IS NULL OR char_length(brand_name_snapshot) BETWEEN 1 AND 80)`.

### A2-125: phone_verified_at survives a phone change or removal, so from R2 an unverified new number counts as verified and claims users_verified_phone_key

- **Where:** 5.1 users, phone_verified_at and users_verified_phone_key (lines at `b81e3f1`: 49, 78)
- **Category:** edge-case
- **Text:** 04a:78 '`users_verified_phone_key UNIQUE (phone_hash) WHERE phone_verified_at IS NOT NULL` ... From R2 a verified phone belongs to one account, which phone OTP login needs.'
- **Problem:** `updateMe` accepts `phone?` (06). Nothing clears `phone_verified_at` when `phone_hash` changes or becomes null, and no CHECK ties the timestamp to a stored phone. From R2, a user who verified number A and then saves number B stays verified with B's hash. The real holder of B can then no longer verify it (23505 on the partial unique index), and OTP login for B resolves to the wrong account. 04 §19.2 step 3 also leaves `phone_verified_at` set while it nulls the phone. R1 is unaffected, because the column is always null, but the baseline fixes the schema now.
- **Suggested fix:** 04a §5.1: add `users_phone_verified_check CHECK (phone_verified_at IS NULL OR phone_hash IS NOT NULL)` and the rule 'any UPDATE that changes `phone_hash` sets `phone_verified_at` to null in the same statement'. As a backstop, add a `BEFORE UPDATE OF phone_hash` trigger that sets `NEW.phone_verified_at := NULL` when `NEW.phone_hash IS DISTINCT FROM OLD.phone_hash` and the statement did not set `phone_verified_at` itself. Add `phone_verified_at` to the 04 §19.2 users row.

### A2-128: 04a §6.2 claims the role CHECK makes 'owner is never a membership row' hold by construction; §16.4 correctly says it cannot

- **Where:** §6.2 shop_memberships (lines at `b81e3f1`: 350)
- **Category:** cross-doc
- **Text:** 'The list excludes `owner`, so the rule that the owner is never a membership row (ADR-0006) holds by construction.'
- **Problem:** Leaving the value 'owner' out of the role list does not stop the owning user from holding a `manager` (or any other) membership row in their own shop. 04 §16.4 (owner of invariants) lists this rule as one that cannot be a constraint and is enforced by `inviteMember` and `acceptShopInvitation`. 04a's own next bullet says the same. The 'by construction' sentence could lead an implementer to skip the action check.
- **Suggested fix:** 04a §6.2: '… The list excludes an `owner` role value. That the owning user never has a membership row in their shop spans `shops` and is application-enforced (next bullet; 04 §16.4)'.

### A2-130: The 20-pending-invitation limit counts expired invitations, which nothing revokes, and the count takes no lock

- **Where:** 6.3 shop_invitations, Keys and constraints and Indexes | §6.3 shop_invitations indexes (lines at `b81e3f1`: 390, 397 | 04a:390, 397, 399; 01:561; 06:774-775)
- **Category:** edge-case
- **Text:** 04a:397 'Pending list and the limit of 20 pending invitations: `WHERE shop_id = ? AND accepted_at IS NULL AND revoked_at IS NULL`'; 04a:390 'an expired open invitation still counts; `inviteMember` revokes it first in the same transaction'
- **Problem:** 04a §6.3 (390, 397, 399) counts pending invitations WHERE accepted_at IS NULL AND revoked_at IS NULL, with no expires_at > now(). Expiry never revokes an invitation; only a re-invite of the same address, a suspension or a closure does. Twenty unanswered invitations to different addresses therefore fill the limit of AC-FR-SHOP-005-4 for good, until the owner revokes them one by one or the purge removes them a year later. listMembers shows them as pending, although INV-27 means they can never be accepted. No lock is named for the count, so two concurrent invites at 19 can both pass.
- **Suggested fix:** 04a §6.3 index row: 'the limit of 20 pending invitations counts WHERE shop_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() (the partial index still serves it)'. inviteMember locks the shops row FOR UPDATE (05 §4.4 level 0) before it counts and before it revokes the address's open invitation. listMembers labels expired open invitations 'expired' (or omits them), not pending.

### A2-131: shop_review_decisions requires a 20-character suspension reason, but 01, 02 and 06 set no minimum, so a short reason becomes a 500

- **Where:** 6.5 shop_review_decisions, Keys and constraints (lines at `b81e3f1`: 451)
- **Category:** cross-doc
- **Text:** 04a:451 '`shop_review_decisions_reason_check CHECK (decision NOT IN ('rejected','suspended') OR (reason IS NOT NULL AND char_length(reason) BETWEEN 20 AND 2000))` (AC-FR-SHOP-002-3)'
- **Problem:** The cited AC-FR-SHOP-002-3 covers rejections only. For suspension:
- 01 AC-FR-SHOP-007-1 says only 'with a reason and a mode'.
- 06 `suspendShop` lists `reason` with no length.
- 02 J-17 refuses only a missing reason.
- User suspension uses 10 characters (07 §3.12).
  A validator written from those documents accepts a 5-character reason. The insert then hits 23514, and 06 §5.3 answers 500 INTERNAL because this CHECK is not allow-listed. 04 §2.8 requires the validator to mirror the database rule. `reinstateShop`'s `reason` (06) has no upper bound in the table.
- **Suggested fix:** Put the value in the owners. 06 `suspendShop` row: '`reason` (20–2000 characters, shown to the owner)'. 01 AC-FR-SHOP-007-1: 'with a reason of at least 20 characters'. Or, if 10 is preferred to match user suspension, lower the suspended branch of the CHECK to 10–2000. Also cap every other decision: `AND (reason IS NULL OR char_length(reason) <= 2000)`.

### A2-132: shop_addresses.label has a 30-character rule but no CHECK, unlike user_addresses

- **Where:** 6.6 shop_addresses, columns and Keys and constraints (lines at `b81e3f1`: 470, 486)
- **Category:** constraint
- **Text:** 04a:470 '`label` | text | yes | | At most 30 characters'
- **Problem:** §6.6 says its layout matches `user_addresses` and that one validator serves both. Its constraint list, however, has no label CHECK, while §5.5 defines `user_addresses_label_check`. A label longer than 30 characters (or an empty one) is stored if the validator is bypassed. 04 §2.8 requires a named length CHECK on every string with a rule.
- **Suggested fix:** Add to the 04a §6.6 constraints: '`shop_addresses_label_check CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 30)`'.

### A2-133: slug_redirects is given two owning modules in 04a; 03 §4.4, which owns module boundaries, assigns it to shops only

- **Where:** 6.10 slug_redirects, header (lines at `b81e3f1`: 572, 625)
- **Category:** cross-doc
- **Text:** 04a:572 '**Module** `shops` (shop slugs) and `catalog` (category slugs)'
- **Problem:** 03 §4.4 lists `slug_redirects` among the tables owned by `shops`, and catalog's owned tables do not include it. Only the owning module may write its tables (03 module rules, T-ARCH-001). Yet 04a §7.1 makes every category slug change insert a `slug_redirects` row. An implementer either breaks the boundary test or cannot tell which module's action writes category redirects.
- **Suggested fix:** Pick one side:
- 04a §6.10 header: 'Module `shops`. Category redirects are written in R1 by the reference seeder, and later by catalog through a shops public action `recordSlugRedirect(trx, { entityType, oldSlug, entityId })`'. §7.1 then cites that action.
- Or 03 §4.4 records the shared ownership of category rows.

### A2-134: Reference tables §7.1-§7.4 miss the §2.8 length CHECKs and the §2.2 timestamps

- **Where:** §7.1 categories; §7.2 attributes; §7.4 category_attributes (lines at `b81e3f1`: 613-614, 623-627, 644, 651, 686-694)
- **Category:** schema
- **Text:** 04a:613 `name` '2–60 characters; unique among siblings only', but 04a:623-627 have no name CHECK; 04a:644 `attributes.name` 'Display name', and 04a:651 has no length CHECK; 04a:686-692 `category_attributes` has no created_at/updated_at. 04:107 §2.2 '`created_at timestamptz NOT NULL DEFAULT now()` on every table. Where rows change, `updated_at` ... is maintained by a trigger'; 04:262 §2.8 named length CHECKs.
- **Problem:** The documented 2-60 limit on category names is not enforced, and `attributes.name` and `categories.description` are unbounded, against §2.8. `category_attributes` rows change (`is_required`, `position`; 04a:710 'changed by seeders (R1) or the admin UI (R2)') but have neither timestamp column, against §2.2.
- **Suggested fix:** Add `categories_name_check CHECK (char_length(name) BETWEEN 2 AND 60)`, `categories_description_check CHECK (description IS NULL OR char_length(description) <= 5000)` [Assumption], `attributes_name_check CHECK (char_length(name) BETWEEN 1 AND 60)` [Assumption], and `created_at`, `updated_at timestamptz NOT NULL DEFAULT now()` with the set_updated_at trigger on `category_attributes`.

### A2-135: 04a §7.3 says the attribute-value key serves ?size=m, but 06 §6.3 names size filters by attribute code, and a generic size parameter cannot use (attribute_id, code)

- **Where:** §7.3 attribute_values, Indexes (lines at `b81e3f1`: 676)
- **Category:** cross-doc
- **Text:** `attribute_values_attribute_code_key` serves filter URLs (`?size=m` → value ID) and seeder upserts.
- **Problem:** 06 §6.3 owns the filter parameters and names attribute filters by attribute code (apparel_size, shoe_size_eu, waist_size_in, color). 08 §11.1 says 'not a generic size', and 08's note 33 already asks 02 to drop `size=m`, but not 04a. The unique key is (attribute_id, code), so it can resolve a value only when the parameter names the attribute. A generic `?size=40` is ambiguous, because 40 exists in both shoe_size_eu and waist_size_in: exactly the F12 collision this table was designed to allow.
- **Suggested fix:** 04a §7.3 Indexes: '`attribute_values_attribute_code_key` serves filter URLs (`?apparel_size=m` → the value ID of m under apparel_size, 06 §6.3) and seeder upserts.'

### A2-137: product_listings.published_at has no stated source; copying products.published_at lets unpublish/republish bump a product to the top of 'Newest'

- **Where:** §7.12 product_listings; §7.6 products (lines at `b81e3f1`: 757-758, 944, 962)
- **Category:** schema
- **Text:** 04a:757 `products.published_at` 'Last time it became `published`'; 04a:758 `first_published_at` 'Never cleared; "new arrivals" and sitemap'; 04a:944 'Storefront listings, filters and search read only this table'; 04a:962 `product_listings.published_at` '"Newest" sort' (source not given).
- **Problem:** The storefront's `newest` sort (06:378) reads only product_listings, which has a `published_at` whose source is not stated. Copying the same-named `products.published_at`, the obvious reading, lets a vendor bump a product to the top of 'Newest' by toggling unpublish and publish. That contradicts §7.6, which assigns 'new arrivals' to `first_published_at`.
- **Suggested fix:** 04a §7.12: `published_at` is copied from `products.first_published_at` (or rename the column `first_published_at`), and the `newest` sort and product_listings_category_idx / product_listings_shop_idx use it.

### A2-141: The axes-freeze condition misses archived variants, whose option values still reference the axes

- **Where:** §7.8 Axes freeze; §7.10 Lifecycle (lines at `b81e3f1`: 825, 877, 915)
- **Category:** edge-case
- **Text:** 04a:825 'Once any variant of the product has an inventory movement or an order line, its axis set is fixed ... `replaceProductVariants` answers 409 ... instead of letting the 23503 surface.' 04a:877 a never-stocked variant in a cart is archived instead of deleted. 04a:915 option values are 'removed only by the cascade from a hard-deleted draft variant'.
- **Problem:** A variant archived by the cart fallback has no movement and no order line, so by this rule the axes are not frozen. Its `variant_option_values` rows remain, though, so removing or replacing that axis fails with 23503 from `variant_option_values_axis_fkey` (RESTRICT). That is exactly the 500 the 409 is meant to prevent. Adding new axes while the old referenced axis rows stay would also exceed the two positions allowed by the CHECK.
- **Suggested fix:** 04a:825: 'The axis set is fixed once the product has any variant that cannot be hard-deleted: an archived variant, or one with an inventory movement, an order line or a cart line. `replaceProductVariants` answers 409 in that case.'

### A2-142: product_listings_price_range_check makes the listing refresh fail for a published product with a zero-priced active variant; the visibility rule should exclude it

- **Where:** §7.12 product_listings; §7.9 price check (lines at `b81e3f1`: 857, 944, 968, 982)
- **Category:** constraint
- **Text:** 04a:944 a row exists for 'product `published`, shop `active`, at least one `ready` image and at least one active variant'; 04a:968 `product_listings_price_range_check CHECK (min_price_minor > 0 AND min_price_minor <= max_price_minor)`; 04a:857 price 0 is allowed; only publication requires > 0.
- **Problem:** No constraint or re-check keeps active variants of an already published product above 0, and openapi allows `price_minor` 0 on `replaceProductVariants`. For such a product the refresh computes min_price_minor = 0, the upsert fails with 23514, and `catalog.refresh_listing` exhausts its retries. The old row, with its old prices and stock, stays visible. A nightly `catalog.rebuild_listings` written as one statement would fail entirely. The root gap (price 0 on a published product) is separate; this is the effect it has on this table.
- **Suggested fix:** 04a:944: add 'and every active variant has `price_minor > 0`' to the visibility rule, so such a product loses its row instead of failing the refresh. State that `catalog.rebuild_listings` recomputes products independently, so one bad product does not abort the rebuild.

### A2-143: product_listings has no column for the card image's alt text (nor a brand slug) that openapi ListingCard requires, though listings are read with no joins

- **Where:** §7.12 product_listings, columns (lines at `b81e3f1`: 944, 953, 961)
- **Category:** schema
- **Text:** 04a:944 'Storefront listings, filters and search read only this table (ADR-0014), one query per page, with no joins.' 04a:953 `brand_id`, `brand_name`; 04a:961 `primary_image_keys` 'Derived image keys of position 1'.
- **Problem:** openapi ListingCard requires `image.alt` (openapi.yaml:2433-2441) and `brand {slug, name}` (2415-2424). The read model stores neither the alt text of the position-1 image (`product_media.alt_text`, or the '{title}, {colour}' fallback of AC-FR-MED-002-2) nor a brand slug. The card can be built only by joining product_media and brands, or by dropping the alt text, which is an accessibility loss. The brand object shape is an [Assumption] (openapi note 19); the missing alt text is not logged anywhere.
- **Suggested fix:** Add `primary_image_alt text NOT NULL` (position-1 alt text, or the fallback computed at refresh; CHECK char_length <= 200) and, if the brand object is kept, `brand_slug citext NULL` to product_listings. The refresh sets both, and a brand rename queues `catalog.rebuild_listings`.

### A2-144: Listing rows are not refreshed when a shop is closed, renamed or re-slugged; 03 triggers catalog.refresh_listing only on shop.suspended and shop.reinstated

- **Where:** §7.12 product_listings, Lifecycle and retention (lines at `b81e3f1`: 944, 949, 963, 982)
- **Category:** cross-doc
- **Text:** 04a:944 a row requires 'shop `active`'; 04a:949 `shop_slug`, `shop_name` are copied; 04a:963 `search_tsv` includes `shop_name`; 04a:982 refresh 'after product, variant, inventory-availability, media and shop-status events'.
- **Problem:** 03 owns the events and jobs. 03:988 triggers `catalog.refresh_listing` only on `shop.suspended` and `shop.reinstated`, and the shops module (03:385) emits no closure or profile/slug event. After `active --> closed` (05:1358) the shop's products stay in listings and search until the 03:30 rebuild. After `adminUpdateShop` changes the slug (06:822), or the shop name changes, `shop_slug`, `shop_name` and `search_tsv` stay stale. T-CAT-108 ('a row exists if and only if the product is visible') cannot hold in between.
- **Suggested fix:** 03 §4.4 and §9 (owner): add `shop.closed` and `shop.profile_updated` (name or slug) events that queue `catalog.refresh_listing` for each product of the shop (or one `catalog.refresh_shop_listings` job). 04a §7.12 and T-CAT-108 name closure and rename explicitly.

### A2-145: 06 and openapi listing examples use image keys p/<public_id>/<position>-<width>.webp, not the content-addressed key format of 03 §3.5 and 04a §7.13

- **Where:** §7.13 media_assets, derived_keys (lines at `b81e3f1`: 998, 1027)
- **Category:** cross-doc
- **Text:** 04a:998 `derived_keys` 'Width → public WebP key, for example `{"320": "p/<id>/<sha-prefix>-320.webp", …}`'; 04a:1027 'Derived public images are content-addressed and never overwritten'; 03:257 `p/<media_asset_id>/<sha256-prefix>-<width>.webp`.
- **Problem:** 06:922 and openapi.yaml:375-376 show `"320": "p/7K3M9QXA/1-320.webp"`, keyed by the product's public_id and gallery position. Such a key is not content-addressed: reordering images would change what `1-320.webp` means under an immutable one-year cache. 03 (storage layout) and 04a agree with each other; the examples are wrong.
- **Suggested fix:** 06 §14.1 and openapi.yaml: use keys of the form `p/<media_asset_id>/<sha256-prefix>-320.webp` in the examples.

### A2-146: The 5-KYC-document limit has no lock, so parallel uploads exceed it, and which statuses count is unstated

- **Where:** §7.13 media_assets, Keys and constraints (lines at `b81e3f1`: 1018)
- **Category:** edge-case
- **Text:** 04a:1018 'Application-enforced: at most 5 KYC documents per shop (AC-FR-SHOP-014-3)'.
- **Problem:** A count-then-insert in `createMediaUpload` at READ COMMITTED lets two parallel requests both see 4 documents and both insert. A multi-file picker sends parallel requests, so a shop ends with 6 or more. The rule also does not say whether `rejected` and `deleted` rows count; if they do, a shop whose uploads were rejected can never replace them.
- **Suggested fix:** 04a §7.13: '`createMediaUpload` with kind `kyc_document` locks the `shops` row FOR UPDATE, then counts `media_assets WHERE shop_id = :s AND kind = 'kyc_document' AND status NOT IN ('rejected','deleted')` (served by media_assets_shop_kind_idx) before inserting; over 5 is 422.'

### A2-149: 04a §11 intro says the migrator may disable the order guard triggers for the retention purge; no purge needs it, and DISABLE TRIGGER would block checkout (07 §4.10 rules it out)

- **Where:** §11 intro (allow_only_columns) | §11 introduction, after allow_only_columns() | §11 introduction (Amounts and snapshots are written once) (lines at `b81e3f1`: 1580 | 04a:1580)
- **Category:** sql-code
- **Text:** 'The migrator role can still disable the trigger for the retention purge ([04 §2.12](../04-domain-model-and-data-dictionary.md)).'
- **Problem:** 04a:1580 says 'The migrator role can still disable the trigger' for the retention purge. orders_guard, shop_orders_guard and order_items_guard (allow_only_columns()) fire only BEFORE UPDATE. The retention purge is a DELETE, and order rows are never deleted. The §19.2/§19.3 redaction updates only shipping_address, customer_email_snapshot and customer_note, which orders_guard already allows. So no purge needs the triggers disabled. Following the sentence would do harm: ALTER TABLE orders DISABLE TRIGGER takes a SHARE ROW EXCLUSIVE lock, which conflicts with the ROW EXCLUSIVE lock of every checkout INSERT and stalls checkout for the whole purge, and it turns the guard off for every session. 07 §4.10 says the retention command never disables a trigger. Queued IN-51, IN-62 and IN-63 fix only 04 §2.12 and §19.3, not this sentence.
- **Suggested fix:** Replace the 04a:1580 sentence with: 'No retention step bypasses these guards. They fire only on UPDATE, the retention command only redacts the allowed snapshot columns of orders (04 §19.3), and a DELETE does not fire a BEFORE UPDATE trigger. The command never disables a trigger (07 §4.10): DISABLE TRIGGER takes a SHARE ROW EXCLUSIVE lock that would block checkout inserts. Schema backfills follow 04 §20.2.4.'

### A2-151: Queued IN-57's partial-index option would remove index support from the admin one-shop view and the suspension job

- **Where:** §11.2 shop_orders, Indexes (lines at `b81e3f1`: 1771-1772)
- **Category:** index-query
- **Text:** `shop_orders_seller_all_idx` | `(shop_id, created_at DESC, id DESC)` | Seller order list, "All" tab; admin view of one shop's orders
- **Problem:** Queued IN-57 (A4-114) says to add `acceptance_due_at IS NOT NULL` to `shop_orders_seller_all_idx` and `shop_orders_seller_list_idx`, "for example as a partial-index WHERE". PostgreSQL uses a partial index only when the query's WHERE clause implies the predicate, and CHECK constraints do not help. Some documented queries on these indexes do not carry the predicate or must see `awaiting_payment` rows. These are the admin view of one shop's orders (the adminListOrders `shop` filter, 06 §6.3; rule 0 applies to shops, not staff) and the `(shop_id, status)` selects of `orders.handle_shop_suspension` and the frozen-shop acceptance sweeper (05 §8.10, §8.11). They would lose their index and scan all of `shop_orders`. So the queued fix, as worded, is incomplete.
- **Suggested fix:** When IN-57 is applied, keep both indexes non-partial and add `AND acceptance_due_at IS NOT NULL` to the seller queries as a filter (the few `awaiting_payment` rows are dropped at the heap). Say in the index table that admin and job queries use the same indexes without the predicate. If partial indexes are preferred, add a separate `(shop_id, status)` index for the admin and job queries and list it.

### A2-156: payments.method = orders.payment_method is not set only by checkout, and it can be enforced by a composite FK

- **Where:** §12.1 payments, notes | 12.1 payments (lines at `b81e3f1`: 2222)
- **Category:** constraint
- **Text:** 04a:2222 "That `payments.method` equals `orders.payment_method` spans two tables and is set by the checkout action only."
- **Problem:** 04a §12.1 (2222) says the rule spans two tables and is enforced by the checkout action only. But startOrderPayment also inserts gateway attempts (05 §6.4) and has its own payment_method input (06), so nothing stops a retry with a method other than the order's: a Khalti attempt on a COD order, or the reverse, which could let a customer pay twice. orders_guard makes orders.payment_method immutable, and both columns share one vocabulary, so the 04 §2.5 composite-FK technique enforces the rule at no risk.
- **Suggested fix:** 04a §11.1: add CONSTRAINT orders_id_payment_method_key UNIQUE (id, payment_method). 04a §12.1: add CONSTRAINT payments_order_method_fkey FOREIGN KEY (order_id, method) REFERENCES orders (id, payment_method) ON DELETE RESTRICT, and change the bullet to cite it: 'every attempt, including the retries of startOrderPayment, uses the order's method'. Follow-up for 06: startOrderPayment's payment_method must equal the order's (422 otherwise), or the field is dropped.

### A2-158: payment_allocations_shop_order_idx is said to serve the payout 'held' check, which never reads allocations

- **Where:** §12.2 Indexes (and 04 §17.2 row) (lines at `b81e3f1`: 2266; 04-domain-model-and-data-dictionary.md:1488)
- **Category:** index-query
- **Text:** 04a:2266 "`payment_allocations_shop_order_idx (shop_order_id)` serves the refundable amount of a shop order and the payout "held" check." 04:1488 "Allocation of a shop order (refundable amount, payout hold)".
- **Problem:** The held rule and query (05 §6.8, §7.6) read return_requests, refunds and support_cases by shop_order_id, never payment_allocations. The stated purpose is wrong, and an index review based on it would be misled.
- **Suggested fix:** 04a §12.2: "`payment_allocations_shop_order_idx (shop_order_id)` serves the refundable amount (the allocations of the paying attempt and of any late-captured attempt) and the order pages." Remove "payout hold" from the 04 §17.2 row at line 1488.

### A2-160: 03 §7.4 records last_error on a refund, a column 04a does not define; 04a never says where a refund's provider error is kept

- **Where:** §12.4 refunds (columns) vs 03 §7.4 (lines at `b81e3f1`: 2335-2357; 03-system-architecture.md:796)
- **Category:** cross-doc
- **Text:** 03:796 "K->>DB: record last_error, keep processing, send refunds.verify delayed 1 min". The 04a §12.4 column list has no last_error or failure column.
- **Problem:** 04a owns the columns, and refunds has no `last_error`. 05 §8.8 moves a refund to `failed` "with the provider message", but 04a does not say where that message lives. The only candidate is `provider_events.error` on the refund call row. An implementer of 03 §7.4 would write a column that does not exist.
- **Suggested fix:** Add a sentence to 04a §12.4: "A refund's provider errors are stored in the `error` column of its `refund:<refund id>:<attempt>` and `refund_lookup` rows in provider_events (§12.3). The refunds row keeps no error text." 03 §7.4 line 796 then reads "record the provider error on the refund call's provider_events row". If finance must see the reason on the queue without a join, add `last_error text NULL CHECK (last_error IS NULL OR char_length(last_error) <= 2000)` to refunds instead.

### A2-163: Money rows the docs treat as fixed can still be changed: approved payouts, payout links (owner role), refunds, refund_items and vendor_remittances

- **Where:** §12.4, §12.5, §13.2, §13.3, §13.4 lifecycle notes and triggers (lines at `b81e3f1`: 2449, 2600, 2653-2658, 2704)
- **Category:** invariant
- **Text:** 04a:2658 "Once approved, links are permanent." 2600 "`Σ payout_entries = amount_minor = −(its payout entry)`". 2449 refund_items "Inserted with the refund, never updated". 2704 vendor_remittances "Insert-only in practice ... not by editing the row".
- **Problem:** 05 relies on these values staying fixed: refund_items amounts and affects_vendor_ledger are "fixed from then on" and "Nothing is recomputed at success". The payout identity also depends on payouts.amount_minor staying equal to the posted `payout` entry. The only enforcement is the privileges of dripnepal_app, which still has UPDATE and DELETE on payouts, refunds, refund_items and vendor_remittances. payout_entries_guard fires only on INSERT and DELETE, and UPDATE is revoked only from the app role, so the owner role can repoint the links of a paid payout. Compare payments_amount_guard and the allow_only_columns() guards on the order tables. Tested on PostgreSQL 18.6: as dripnepal_app, `UPDATE payouts SET amount_minor = 1` on a paid payout succeeded. As the owner, `UPDATE payout_entries` on a paid payout's link succeeded.
- **Suggested fix:** §13.3: add `CREATE TRIGGER payout_entries_no_update BEFORE UPDATE ON payout_entries FOR EACH ROW EXECUTE FUNCTION forbid_mutation();`. §13.2: add a guard `BEFORE UPDATE ON payouts` that raises P0001 when `OLD.status <> 'draft'` and `(NEW.amount_minor, NEW.payout_account_id, NEW.shop_id) IS DISTINCT FROM (OLD.amount_minor, OLD.payout_account_id, OLD.shop_id)`; the tax step of approvePayout runs while the payout is still draft, so it is unaffected. §12.4: `CREATE TRIGGER refunds_guard BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION allow_only_columns('status','approved_by','approved_at','is_single_operator_approval','succeeded_at','attempts','provider_refund_id','paid_reference','recipient_details_enc','note','version','updated_at')`. §12.5 and §13.4: `REVOKE UPDATE, DELETE, TRUNCATE ON refund_items, vendor_remittances FROM dripnepal_app`. Update the dripnepal_app row of 07 §4.10 to match, and add these cases to T-LED-102 / T-ARCH-012.

### A2-164: 06 createLedgerAdjustment takes reference?, which has no column in ledger_entries, and omits the reverses_entry_id and shop_order_id inputs of 05 §7.8

- **Where:** 13.1 ledger_entries (lines at `b81e3f1`: 2461-2474)
- **Category:** cross-doc
- **Text:** 04a §13.1 columns: shop_id, entry_type, amount_minor, currency, shop_order_id, order_item_id, refund_id, payout_id, remittance_id, reverses_entry_id, available_at, description, created_by, dedupe_key (no reference column)
- **Problem:** 05 §7.8 (owner of the ledger inputs) lists `shop_id`, signed `amount_minor`, `reason`, and optional `reverses_entry_id` and `shop_order_id`, which 04a stores. 06 lists `reference?` instead and drops the two references, so the API contract has a field with nowhere to go and lacks two that the schema and 05 rely on. 05 §7.7 needs `reverses_entry_id` for a transfer returned after `paid`, and 05 §7.6 needs `shop_order_id` for the held filter.
- **Suggested fix:** In 06 §13 (line 842) and openapi, change the inputs to `shop_id`, `amount_minor` (signed), `reason`, `reverses_entry_id?`, `shop_order_id?`, and drop `reference?`. A bank or provider reference belongs in `reason`, which becomes `description`. No 04a change is needed.

### A2-165: payout_entries_guard makes the documented closed-shop ledger purge impossible (the proposed 07 §4.10 exemption covers only forbid_mutation())

- **Where:** §13.1 lifecycle; §13.3 payout_entries_guard (lines at `b81e3f1`: 2544, 2610, 2637-2654, 2662)
- **Category:** retention-privacy
- **Text:** 04a:2544 ledger entries "purged, if at all, only for a closed shop with a zero balance, 7 years after its last entry"; 2610 payouts "kept with the shop's ledger"; 2662 payout_entries "As §13.2".
- **Problem:** The guard raises P0001 whenever the payout is not `draft`, and it fires for every role, the migrator included. Links of approved, paid or failed payouts can therefore never be deleted. Their ON DELETE RESTRICT FKs then block deleting those ledger_entries and payouts. The retention exemption proposed in 07 §4.10 covers only forbid_mutation(), not this guard. Tested on PostgreSQL 18.6: as the owner role, `DELETE FROM payout_entries` for a paid payout gave "payout_entries can change only while the payout is a draft".
- **Suggested fix:** When the 07 §4.10 exemption is approved, give payout_entries_guard() the same branch as its first statement: `IF TG_OP = 'DELETE' AND current_user = 'dripnepal_migrator' AND current_setting('dripnepal.retention_purge', true) = 'on' THEN RETURN OLD; END IF;`. The purge then deletes, in order: links, then ledger_entries (self-references in one statement), then payouts and vendor_remittances. Until then, say in §13.1 and §13.3 that the purge needs this exemption.

### A2-167: support_cases.subject is NOT NULL (3-150 characters) but no operation, journey or system path supplies it

- **Where:** §14.1 support_cases (subject column, support_cases_text_check) | 14.1 support_cases (lines at `b81e3f1`: 2725, 2760)
- **Category:** edge-case
- **Text:** `subject` text, not null, default "App", "3–150 characters, for lists"; `CHECK (char_length(subject) BETWEEN 3 AND 150 ...)`
- **Problem:** 04a §14.1 (2725, 2760) requires a subject, but no input provides one: 01 AC-FR-ADM-009-1 has a category and a description, 02 J-19 step 1 asks for category, optional order and description, 06 openSupportCase takes category, order_number?, shop_order_number? and message, and 08 shows only category and order link. System-opened cases (second delivery failure, COD dispute, reversal) name none either. Each implementer would invent a value, and the insert fails when it is not 3-150 characters.
- **Suggested fix:** 04a §14.1 subject note: 'Generated by the server: the category label plus the linked shop order or order number (for example Delivery · DN-7K3M9QX-1), otherwise the first line of the first message truncated to 150 characters; system-opened cases use a fixed template per trigger; always 3-150 characters.' Alternatively, add subject (3-150) to openSupportCase in 06, 01 and 02 J-19 step 1.

### A2-168: support_cases can link an order and a shop with no shop order, so the shop-to-order link is unenforced

- **Where:** §14.1 support_cases (INV-02/INV-03 scope) (lines at `b81e3f1`: 2743-2755)
- **Category:** constraint
- **Text:** `support_cases_links_check CHECK ((order_id IS NULL OR customer_user_id IS NOT NULL) AND (shop_order_id IS NULL OR (order_id IS NOT NULL AND shop_id IS NOT NULL)))`; the composite FKs apply only through `shop_order_id`.
- **Problem:** A row with `order_id` = customer X's order and `shop_id` = shop S, but no `shop_order_id`, passes every constraint even when S sold nothing in that order. `listShopSupportCases` selects by `shop_id`, so S's members would see a case about another shop's customer order. That breaks INV-02 ('No row of one shop references a row of another shop'), which §16.2 claims holds for every writer.
- **Suggested fix:** Extend the links check: `… AND (order_id IS NULL OR shop_id IS NULL OR shop_order_id IS NOT NULL)`. A case about an order and a shop must name the shop order, so the composite FKs tie all three together.

### A2-169: Limits and rules stated in 04a §12-§15 have no CHECK: refunds.note, provider_events.error, notification_deliveries.last_error and recipient, audit_logs.actor_role

- **Where:** §14.3 notification_deliveries and §15.3 audit_logs constraint lists | 12.3 provider_events, 12.4 refunds, 14.3 notification_deliveries (lines at `b81e3f1`: 2833-2834, 2839, 2846-2856, 3005, 3021-3024 | 2290, 2345, 2839)
- **Category:** constraint
- **Text:** `last_error`: "At most 1,000 characters, with addresses redacted"; `recipient_user_id` "A user recipient" and `shop_id` "A shop's contact address as recipient" (both nullable); `actor_role` nullable, "Role at the time"
- **Problem:** 04 §2.8 says a length rule lives once in the database, as a named CHECK. But refunds.note (2345), provider_events.error (2290) and notification_deliveries.last_error (2839) have stated limits and no CHECK. Nothing stops a notification_deliveries row with neither recipient or with both (recipient_user_id, shop_id), although the dedupe key and the 'did the customer get the email' lookup assume exactly one (2833-2834, 2846-2856). 02 AC-J00-09 requires actor_role on every shop-member or staff change, but audit_logs_actor_check (3021-3024) requires only actor_user_id.
- **Suggested fix:** Add CONSTRAINT refunds_note_check CHECK (note IS NULL OR char_length(note) <= 2000); CONSTRAINT provider_events_error_check CHECK (error IS NULL OR char_length(error) <= 2000); CONSTRAINT notification_deliveries_last_error_check CHECK (last_error IS NULL OR char_length(last_error) <= 1000); CONSTRAINT notification_deliveries_recipient_check CHECK (num_nonnulls(recipient_user_id, shop_id) = 1). Extend audit_logs_actor_check to CHECK (actor_type NOT IN ('shop_member','platform_staff') OR (actor_user_id IS NOT NULL AND actor_role IS NOT NULL)).

### A2-170: 04a §15.1 cites AC-FR-CHK-007-3 for the 60-second settings cache, and its 'empty banner means none' contradicts 08's default kill-switch message

- **Where:** §15.1 platform_settings (intro paragraph; maintenance_banner row) | 15.1 platform_settings (lines at `b81e3f1`: 2879, 2893 | 2879)
- **Category:** reference
- **Text:** "Other reads may be cached for at most 60 seconds (AC-FR-CHK-007-3)."; maintenance_banner "≤ 280 characters; empty means none ... Shown automatically while checkout is disabled"
- **Problem:** AC-FR-CHK-007-3 says the COD limits are read inside the placeOrder transaction. It supports the preceding sentence, not the 60-second cache bound, which comes from AC-FR-ADM-010-1 and AC-J00-11 (kill switch effective within 60 seconds) (04a:2879). 08 owns the UI: with checkout_enabled false and an empty maintenance_banner, it shows a fixed default message from the message catalog. 04a (2893) says an empty value means no banner, which would show nothing while checkout is disabled and fail AC-FR-ADM-010-1.
- **Suggested fix:** 04a §15.1: cite AC-FR-CHK-007-3 for the in-transaction sentence, and '(AC-FR-ADM-010-1, AC-J00-11)' for 'other reads may be cached for at most 60 seconds'. maintenance_banner: '≤ 280 characters; while checkout_enabled is false, an empty value shows the default message of 08 §2 (SiteBanner); otherwise no banner'.

### A2-171: Setting changes must be audited with old and new values, but platform_legal_disclosures values contain full phone numbers, which §15.3 forbids in changes

- **Where:** §15.1 'Every key' paragraph vs §15.3 changes column (lines at `b81e3f1`: 2888, 2907, 3012)
- **Category:** logic
- **Text:** §15.1: "every change writes an `audit_logs` row with the old and new value (AC-FR-ADM-011-2)"; shape includes `contact_phone` and `grievance_officer: {..., phone, ...}`; §15.3 `changes`: "Never plaintext of `*_enc` columns, passwords, tokens or full phone numbers"
- **Problem:** The s4(3) evidence (a change published within 48 hours) needs the actual old and new values of the disclosure, including the published contact and grievance phone numbers. §15.3 forbids full phone numbers in `changes`. A redaction layer built from §15.3 would drop exactly those fields, and a writer built from §15.1 would break the §15.3 rule. 2F3 has also proposed that `changes` hold no personal values at all, which would add the grievance officer's name and email to the conflict. The values are published on /legal, and §15.1 classes the key Public.
- **Suggested fix:** Add to §15.3 `changes`: "Exception: `platform_setting.update` rows store the old and new value in full, because every setting value is Internal or Public data (`platform_legal_disclosures` is what /legal publishes)." Keep the phone and personal-data rule for every other action, and make 07 §5.1/§5.7 carry the same exception.

### A2-174: 04a §15.3 describes audit rows as staff and shop-member changes plus money-moving system actions, but 05 also audits customer and non-money system transitions

- **Where:** §15.3 audit_logs, purpose paragraph (lines at `b81e3f1`: 2997)
- **Category:** cross-doc
- **Text:** "one row per state change made by a shop member or staff member, in the same transaction (AC-J00-09), plus authentication events and system actions that move money"
- **Problem:** 05's transition tables own the 'Audit entry' of each transition. They write audit rows for customer actions (`order.place` on `placeOrder`, `payment.initiate` on `placeOrder`/`startOrderPayment`, `shop_order.cancel` by the customer) and for system transitions that move no money (`shop_order.cancel` for `payment_expired` by `inventory.expire_reservations`, `shipment.*` when an admin intervenes). 05 §6 also lists `actor_type` `customer` and `provider`. A shared `recordAudit` writer or the retention classes designed from 04a's sentence would leave these rows out.
- **Suggested fix:** Reword: "One row per state change that 05's transition tables, 07 and 09 mark as audited, whether the actor is a customer, shop member, staff member, provider or system job, written in the same transaction (AC-J00-09 for shop and staff changes), plus authentication events."

### A2-177: 04a §15.4 says schema:generate emits a class for rate_limits and that the table holds only live windows; 04 §20.3 excludes it, and expired rows stay up to an hour

- **Where:** §15.4 rate_limits, Lifecycle and retention | 15.4 rate_limits (lines at `b81e3f1`: 3069)
- **Category:** framework-claim
- **Text:** "The table holds only live windows, a few thousand rows at most. Because it is in `public`, `schema:generate` emits a class for it; no model uses that class."
- **Problem:** 04 §20.3 and 09 §8.7 set schemaGeneration.excludeTables: ['sessions', 'rate_limits'], and Lucid 22.4.2 filters excluded tables out, so no class is generated. This is an internal 04/04a contradiction that the installed code settles in favour of 04. Also, the limiter's Postgres store (rate-limiter-flexible's RateLimiterPostgres) deletes, every 5 minutes in each process, only rows whose expire is more than an hour in the past, so the table also holds expired windows for up to an hour (04a:3069).
- **Suggested fix:** 04a §15.4: 'clearExpiredByTimeout (on by default) makes each process's store delete, every 5 minutes, rows whose window ended more than an hour ago, so the table holds live windows plus up to an hour of expired ones. 04 §20.3 lists the table in schemaGeneration.excludeTables, so schema:generate emits no class for it and no model reads it.'

### A2-178: 04a §15.5 says the job table is in every backup, that a restore replays queued jobs and that no application query reads pgboss.\*; 11 contradicts all three

- **Where:** §15.5 pg-boss schema (payload, Indexes and Restore bullets) (lines at `b81e3f1`: 3079, 3083, 3085)
- **Category:** cross-doc
- **Text:** "the job table is copied into every backup"; "DripNepal adds none, because no application query reads `pgboss.*` directly"; "After a point-in-time restore, pg-boss replays jobs that were queued at the restore point."
- **Problem:** 11 owns backups and restores. Its nightly dump excludes `pgboss` (only the provider's PITR backups hold it). After a dump restore (11 §11.5 path B) the schema is reinstalled empty and queued or delayed jobs are lost. Sweepers cover orders and payments, but nothing re-sends `notification_deliveries` rows left `queued`, so those emails are silently dropped. The 04a Restore bullet covers only PITR. The proposed `platform.ops_metrics` cron (11 §8.6) and the RPO drill (11 §11.7) read `pgboss.job` directly, so 'no application query' is false. The ops_metrics query is a full aggregate every 5 minutes, which is acceptable without extra indexes.
- **Suggested fix:** Change the three bullets: "Provider PITR backups contain the job table; the nightly dump excludes it (11 §11.2)." "Restore: after a PITR, pg-boss replays jobs queued at the restore point. After a dump restore (11 §11.5 B), queued and delayed jobs are lost. Sweepers re-derive order and payment work, and the restore runbook re-sends every `notification_deliveries` row still `queued` (served by `notification_deliveries_unsent_idx`)." "Indexes: DripNepal adds none. The only direct reads are the read-only `platform.ops_metrics` aggregate (11 §8.6) and drill queries, which scan the table." Ask 11 §11.5 to add the notification re-send step.

## Order, Payment and Inventory Lifecycles

Findings located in [05-order-payment-and-inventory-lifecycles.md](../05-order-payment-and-inventory-lifecycles.md).

### A2-179: 05 §3.1 ER diagram makes ledger_entries.shop_order_id mandatory; 04a (owner) makes it nullable

- **Where:** 05 §3.1 Entities that carry a lifecycle (ER diagram) (lines at `b81e3f1`: 135)
- **Category:** cross-doc
- **Text:** 05:135 `shop_orders ||--o{ ledger_entries : "settled via"` (every ledger entry belongs to exactly one shop order).
- **Problem:** 04a §13.1 owns this column: `shop_order_id` is nullable, and `ledger_entries_reference_check` requires it only for sale, shipping_income, commission, cod_cash_held, refund and commission_reversal. `vendor_remittance`, `payout`, `payout_reversal`, `tax_withholding` and `adjustment` entries have no shop order. 04 §4.4 draws the relationship correctly (`shop_orders |o--o{ ledger_entries`). 05's diagram contradicts both. 04a is the owner of cardinality and nullability, so 05 is the side that is wrong.
- **Suggested fix:** In 05:135 write `shop_orders |o--o{ ledger_entries : "settled via"`.

## DripNepal API Design

Findings located in [06-api-design.md](../06-api-design.md).

### A2-180: 06 refuses only a '4th reattempt'; 04a's CHECK and 05 allow at most two reattempts

- **Where:** §5.3 error table; §13.5 recordFulfillmentEvent row; notes item 4 (lines at `b81e3f1`: 06:309, 06:801, 06:1305; 04a:1938, 04a:1958)
- **Category:** cross-doc
- **Text:** 06:309 INVALID_STATE_TRANSITION "also a 4th delivery reattempt"; 06:801 "(incl. 4th reattempt)". 04a:1938 attempt_count "1 at first shipment, +1 per reattempt"; 04a:1958 `CHECK (attempt_count BETWEEN 0 AND 3)`.
- **Problem:** With attempt_count = 1 at shipment and reattempt allowed only while attempt_count < 3 (05 §6.3, 01 AC-FR-FUL-002-2, 02 AC-J13-05), the third reattempt (the 4th attempt) is refused. 06 says the 4th reattempt is refused, which implies a third reattempt is allowed. That would set attempt_count = 4, which the 04a CHECK rejects with 23514, so the API returns 500 instead of 409. 04a and 05 are the owners and agree.
- **Suggested fix:** In 06, write "a reattempt when attempt_count is already 3 (a 4th delivery attempt)" at 06:309, 06:801 and 06:1305.

### A2-181: 06 updateSupportCase names the resolution field resolution_note; 04a, 01 and 02 call it resolution_summary

- **Where:** §13.6 Admin, updateSupportCase row (vs 04a §14.1 resolution_summary) (lines at `b81e3f1`: 852 (06); 2727 (04a))
- **Category:** cross-doc
- **Text:** 06: `updateSupportCase` input "`status?`, `assignee_user_id?`, `resolution_note?`"
- **Problem:** The written decision the customer sees is `resolution_summary` in 04a §14.1, 01 AC-FR-ADM-009-3 and 02 J-19 step 6. AC-J19-04 expects `VALIDATION_FAILED` for 'resolved without resolution_summary', naming the field the API should report. 06 calls the input `resolution_note`, so the field error and the stored column disagree, and a test written from 02 checks a field the API does not have.
- **Suggested fix:** Rename the 06 input to `resolution_summary` (1–5,000 characters, required when `status` becomes `resolved` or `closed`, per `support_cases_resolution_check`), and use the same name in openapi when these operations are specified.

## Deployment and Operations

Findings located in [11-deployment-and-operations.md](../11-deployment-and-operations.md).

### A2-182: 11's break-glass kill-switch SQL leaves platform_settings.updated_by naming the previous admin

- **Where:** §10.9 step 2, break-glass SQL (vs 04a §15.1 updated_by) (lines at `b81e3f1`: 1670 (11); 2885, 2888 (04a))
- **Category:** cross-doc
- **Text:** 11: `UPDATE platform_settings SET value = 'false'::jsonb, updated_at = now() WHERE key = 'checkout_enabled';` (run as the migrator)
- **Problem:** 04a §15.1 makes `updated_by` the user who last changed the setting (null only for seeded values). The break-glass update changes the value but not `updated_by`, so the settings page and any report built on `updated_by` credit the previous `platform_admin` with turning checkout off during an incident. The audit row written alongside says `system`.
- **Suggested fix:** Change 11's statement to `UPDATE platform_settings SET value = 'false'::jsonb, updated_by = NULL, updated_at = now() WHERE key = 'checkout_enabled';` and change the 04a note to "Null for seeded values and for the break-glass change of 11 §10.9 (the audit row names the operator)".

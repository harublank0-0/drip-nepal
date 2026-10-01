# ADR-0014: Search on PostgreSQL (FTS `simple` config + pg_trgm) with a denormalized listing read model

Status: Draft v1 (2026-09-25)

Reviewed: 2026-09-25 · consistency review 2026-09-30 to 2026-10-01

## Status

| Field              | Value                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted**                                                                                  |
| Date               | 2026-09-25                                                                                    |
| Deciders           | Lead developer                                                                                |
| Supersedes         | —                                                                                             |
| Superseded by      | —                                                                                             |
| Related open items | OD-15 (audience values, size systems, colour list: they define the filter arrays), A-03, R-13 |

Edited 2026-09-30 (consistency review): decision 1 follows the queue policies of [03 §9](../03-system-architecture.md#9-asynchronous-work) (`catalog.refresh_listing` sends carry no `singletonKey`); the decision is unchanged.

## Context

**Requirements** ([01 §7.6](../01-product-requirements.md#76-discovery-and-search-fr-srch)): R1 needs listings with filters, sort, pagination and URL state (FR-SRCH-001), keyword search of 2–100 characters with typo tolerance and Devanagari exact-word matches (FR-SRCH-002), shop pages (FR-SRCH-003), SEO (FR-SRCH-005) and code-configured navigation entries such as `/men/t-shirts` (FR-SRCH-007). Autocomplete (FR-SRCH-006) and facet counts (FR-SRCH-008) are R2; a dedicated search engine is R3. Ranking must contain no paid placement (AC-FR-SRCH-001-5, REG-11).

**Current state** [Verified-repo, RF-27]: catalog, product, search and cart pages run on client-side mock data, and filters are applied in the browser. No server-side listing query exists.

**Scale.** Fewer than about 50 shops at launch [Confirmed, Q1]; at most 5,000 published products and 30,000 variants [Assumption, A-03]. Read target: server p95 ≤ 300 ms at 20 requests/s (NFR-PERF-003); the listing may be stale for at most 60 s at p95 (NFR-PERF-005).

**Content.** Titles are mostly English with romanised Nepali, and may contain Devanagari [Confirmed, Q8: "product text may contain Nepali"].

**PostgreSQL facts** [Verified-doc, accessed 2026-09-25]:

- The `simple` dictionary lower-cases tokens and does no stemming, so English stemming cannot mangle Nepali words or brand names (<https://www.postgresql.org/docs/18/textsearch-dictionaries.html>).
- `pg_trgm` provides `similarity()`, the `%` operator and `gin_trgm_ops`, and is a trusted extension (<https://www.postgresql.org/docs/18/pgtrgm.html>). DigitalOcean Managed PostgreSQL 18 supports it (<https://docs.digitalocean.com/products/databases/postgresql/details/supported-extensions/>).
- Only text search functions that name a configuration can be used in generated columns and indexes (<https://www.postgresql.org/docs/18/textsearch-tables.html>).

**Why a read model.** A listing over normalised tables joins products, variants, inventory, attribute values, shops and categories and aggregates price and stock on every request, which indexes poorly.

## Decision

The table, columns, indexes and refresh rules are owned by [04a §7.12](../04a-data-dictionary-tables.md#712-product_listings-read-model); this ADR records the choice.

1. **Read model `product_listings`**, owned and written only by the `catalog` module.
   - One row per product visible on the storefront: product `published`, shop `active`, at least one `ready` image and one active variant. A product that stops being visible loses its row.
   - Denormalised columns for cards, filters and search: shop, `public_id` and `slug` (ADR-0017), category path and names, brand, audience/size/colour value-ID arrays, min/max price in minor units (ADR-0007), `in_stock`, `published_at`, `search_tsv`.
   - Recomputed per product by `catalog.refresh_listing`, sent transactionally (ADR-0010) after product, variant, inventory-availability, `media.ready` and shop-status events; fully rebuilt by `catalog.rebuild_listings` daily at 03:30 ([03 §9](../03-system-architecture.md#9-asynchronous-work)). Its queue is `standard` and its sends carry no `singletonKey`, because business transactions send it and a keyed send would wait on another transaction's job (03 §9). Each run rewrites the whole row from the source tables, so replays and duplicate runs are harmless ([05 §4.7](../05-order-payment-and-inventory-lifecycles.md#47-what-runs-after-commit)).
   - Checkout re-reads the source tables (ADR-0008, AC-FR-CAT-005-3), so seconds of staleness are safe.
2. **Search document.** `search_tsv` is a generated column using the `simple` configuration: title (weight A), brand name (B), category names and shop name (C). Descriptions are excluded in R1.
3. **Query.**
   - Keyword: `search_tsv @@ websearch_to_tsquery('simple', :q)`, ranked with `ts_rank`. When full-text search finds nothing, fall back to `title % :q` ordered by `similarity(title, :q)`.
   - Filters: category subtree by `category_path LIKE '<prefix>%'`, shop, audience, size, colour, brand, price range and `in_stock`, applied to rows selected by the category or shop index. GIN indexes on the arrays are added only if T-PERF-001 shows listing p95 above 300 ms.
   - Navigation entries (`/men/t-shirts`) map to audience and category filters in `app/modules/catalog/navigation.ts`; unlisted paths return 404 ([04 §3.12](../04-domain-model-and-data-dictionary.md#312-navigation-entries-are-code-configuration-in-r1), AC-FR-SRCH-007-1).
4. **Pagination and sort** (AC-FR-SRCH-001-2/3): page-number pagination, `per_page` ≤ 48 (default 24), `page` ≤ 100; sorts newest, price ascending, price descending and relevance (search only); ties broken by product ID; the total is a capped count. Unknown parameters return 400 `INVALID_QUERY_PARAMETER` (API) or are dropped with a canonical redirect (pages).
5. **Devanagari.** AC-FR-SRCH-002-3 is tested in M4 with real samples [Assumption: the default parser splits Devanagari words acceptably]. If it does not, Devanagari queries use trigram matching only.

## Alternatives considered

| Alternative                                               | Why rejected                                                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated engine now (Meilisearch, Typesense, OpenSearch) | Another stateful service to host, back up and keep in sync on a one-VPS budget (ADR-0016), with no measured need at about 50 shops. Planned for R3. |
| Query normalised tables directly                          | Multi-join aggregations per request; listing p95 degrades as the catalog grows.                                                                     |
| PostgreSQL `english` configuration                        | Stems English words and handles Nepali or romanised words unpredictably. Fashion titles are mostly nouns and brands, where stemming adds little.    |
| Materialized view with `REFRESH … CONCURRENTLY`           | Rebuilds every row on each refresh. Per-product upserts are cheaper and fresher.                                                                    |
| Hosted search SaaS (Algolia)                              | Recurring USD cost, customer data sent to another processor (VX-03, VX-09), and a sync pipeline to maintain.                                        |

## Consequences

**Positive**

- No new infrastructure: listings and search run in the same PostgreSQL, inside the connection budget.
- A listing page is one query on one table with no joins.
- Suspending a shop removes its products on the next refresh, with no separate index to purge.

**Negative**

- Basic relevance: no synonyms, no romanised-to-Devanagari transliteration, and typo tolerance limited to trigram similarity on titles.
- Write amplification: every stock flip that changes `in_stock` or the size/colour arrays rewrites a row.

**Risks**

- _Read-model drift_ from a lost job. Mitigation: transactional send, the nightly rebuild, and T-CAT-108.
- _Slow `%` queries on short strings._ Mitigation: `q` of at least 2 characters and the public catalog rate limit of 120/min per IP.

## When to revisit

Move to a dedicated engine (R3) when **any** of these holds:

- more than 50,000 published products (A-03, [03 §13](../03-system-architecture.md#13-evolution-path-without-a-rewrite));
- search or listing p95 above 300 ms at the NFR-PERF-003 load in T-PERF-001, after adding the array indexes;
- R2 facet counts or autocomplete (300 ms p95, AC-FR-SRCH-006-1) cannot be met in PostgreSQL;
- the product needs synonyms or Nepali transliteration that PostgreSQL dictionaries cannot provide.

## Verification

- **T-PERF-001**: k6 listing and search scenarios at the NFR-PERF-003 load.
- **T-CAT-108 (proposed)**: a row exists if and only if the product is visible; two refreshes give the same row; publish, unpublish, block, shop suspension and stock-out update or remove the row; a rebuild on a consistent database produces no diff.
- **T-CAT-107 (proposed)**: navigation entries resolve against seeded reference data.
- **Search tests** (T-CAT-003, proposed): "snekers" finds "sneakers" (AC-FR-SRCH-002-2); a Devanagari title word is found (AC-FR-SRCH-002-3); paging is deterministic and duplicate-free; an unknown parameter returns 400 `INVALID_QUERY_PARAMETER`.
- **CI index check** (T-PERF-002, proposed): an `EXPLAIN` test on seeded data asserts index scans for the canonical category, shop and search queries.

## Related

- [04a §7.12 `product_listings`](../04a-data-dictionary-tables.md#712-product_listings-read-model), [04 §3.12 navigation entries](../04-domain-model-and-data-dictionary.md#312-navigation-entries-are-code-configuration-in-r1)
- [01 §7.6 discovery and search](../01-product-requirements.md#76-discovery-and-search-fr-srch), [03 §9 jobs](../03-system-architecture.md#9-asynchronous-work)
- [API design (pagination, filtering)](../06-api-design.md), [UI/UX (filters in the URL)](../08-ui-ux-and-design-system.md)
- [ADR-0008](0008-inventory-reservations-and-ledger.md) (authoritative stock), [ADR-0010](0010-postgres-jobs-pg-boss-transactional-send.md) (refresh jobs), [ADR-0017](0017-product-urls-public-id.md) (product URLs)

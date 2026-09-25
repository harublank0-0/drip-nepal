# ADR-0014: Search on PostgreSQL (FTS `simple` config + pg_trgm) with a denormalized listing read model

Status: Draft v1 (2026-09-25)

## Status

| Field | Value |
|---|---|
| Decision status | **Accepted** |
| Date | 2026-09-25 |
| Deciders | Lead developer |
| Supersedes | — |
| Superseded by | — |
| Related open items | OD-15 (audience values, size systems, colour list: these define the filter arrays) |

## Context

**Requirements (R1):**
- category and navigation listings with filters, sort, pagination and URL state (FR-SRCH-001);
- keyword search (FR-SRCH-002);
- a shop storefront page (FR-SRCH-003);
- SEO (FR-SRCH-005).

Facet counts (FR-SRCH-008) and autocomplete (FR-SRCH-006) are R2. A dedicated search engine is listed for R3.

**Current state** [Verified-repo, RF-27, audit A3-12]: catalog, product, search and cart pages run on client-side mock data. Filters live in `useState`, and the whole category list is filtered in the browser. No server-side listing query exists yet.

**Scale.** Fewer than about 50 shops at launch [Confirmed, Q1]. Catalog size is unknown; we assume below 50,000 published products in R1 [Assumption].

**Content.** Product text is mostly English but may contain Nepali in Devanagari, and romanized Nepali is common in titles [Confirmed, Q8: "product text may contain Nepali"].

**PostgreSQL facts** [Verified-doc, accessed 2026-09-25]:
- The `simple` dictionary works by "converting the input token to lower case" and checking stop words. It does no stemming, so English-only stemming cannot mangle Nepali words or brand names (https://www.postgresql.org/docs/18/textsearch-dictionaries.html).
- `pg_trgm` provides `similarity()`, the `%` operator, and GIN/GiST operator classes (`gin_trgm_ops`) that also accelerate `LIKE`/`ILIKE`. It is a "trusted" extension (https://www.postgresql.org/docs/18/pgtrgm.html).
- DigitalOcean Managed PostgreSQL 18 supports `pg_trgm`, `unaccent` and `citext` (https://docs.digitalocean.com/products/databases/postgresql/details/supported-extensions/).

**The cost of querying live tables.** A listing query over normalised tables joins `products`, `product_variants`, `inventory_items`, `product_attribute_values`, `variant_option_values`, `shops` and `categories`, aggregates min/max price and stock, and filters on several attribute arrays. Doing that on every request does not index well.

## Decision

1. **Read model `product_listings`**, owned by the `catalog` module and never written by other modules. It has one row per product that is `published` and whose shop is `active`.
   - Columns: `product_id` PK, `shop_id`, `category_path` (materialised, e.g. `/clothing/tops/t-shirts/`), `title`, `brand_id`, `audience_value_ids[]`, `size_value_ids[]`, `color_value_ids[]`, `min_price_minor`, `max_price_minor`, `in_stock`, `published_at`, `search_tsv`. Exact columns are in [docs/04](../04-domain-model-and-data-dictionary.md).
   - Refreshed by `catalog.refresh_listing` jobs, sent transactionally (ADR-0010) on product publish, unpublish, edit or block, variant or price changes, inventory availability flips, and shop suspension or reinstatement.
   - A nightly full rebuild corrects anything missed.
   - Staleness of seconds is acceptable, because checkout re-validates price and stock authoritatively (ADR-0008).
2. **Search document.**

   `search_tsv = setweight(to_tsvector('simple', title), 'A') || setweight(to_tsvector('simple', brand_name || ' ' || category_names), 'B') || setweight(to_tsvector('simple', attribute_labels), 'C')`

   The description is excluded in R1 to keep the index small and relevant.
3. **Query.**
   - `WHERE search_tsv @@ websearch_to_tsquery('simple', :q) OR title % :q` (trigram similarity for typos and partial romanized words).
   - Ranked by `ts_rank_cd(search_tsv, query)` blended with `similarity(title, :q)`.
   - Filters: array overlap (`audience_value_ids && :ids`), category subtree (`category_path LIKE '/clothing/tops/%'`), price range on `min_price_minor`/`max_price_minor`, and `in_stock`.
   - Navigation entries such as `/men/t-shirts` map to audience + category filters defined in code config (FR-SRCH-007).
4. **Indexes.**
   - GIN on `search_tsv`;
   - GIN `gin_trgm_ops` on `title`;
   - GIN on each value-ID array;
   - btree `text_pattern_ops` on `category_path`;
   - btree on (`published_at DESC`, `product_id`) and (`min_price_minor`, `product_id`).
5. **Pagination and sort** follow [docs/06](../06-api-design.md):
   - page-number pagination, `per_page` ≤ 48, `page` ≤ 100;
   - deterministic order by the sort key then `product_id`;
   - sorts: relevance (search only), newest, price ascending, price descending;
   - the total count is capped (e.g. "1,000+") to avoid exact counts over large result sets.
6. **Devanagari tokenisation** is checked in M4 with real samples [Assumption: the default parser splits Devanagari words acceptably]. If it does not, the fallback is trigram-only matching for Devanagari queries.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Dedicated engine now (Meilisearch, Typesense, OpenSearch) | Another stateful service to host, secure, back up and keep in sync, with no measured need at under 50 shops. Its cost sits in the ADR-0016 budget. Planned for R3 behind the thresholds below. |
| Query normalised tables directly, with no read model | Multi-join aggregations per request and array filters that cannot be indexed. Listing p95 would degrade as the catalog grows. |
| PostgreSQL `english` configuration with stemming | Stems English words and leaves Nepali or romanized words unpredictable. Fashion titles are mostly brand and product nouns, where stemming adds little. |
| Materialized view with periodic `REFRESH … CONCURRENTLY` | Rebuilds every row on each refresh. Per-product upserts from events are cheaper and fresher. |
| Hosted search SaaS (Algolia) | Recurring cost in USD, customer data sent to another processor (VX-09), and a sync pipeline to maintain. |

## Consequences

**Positive**
- No new infrastructure. Search, filters and listings run in the same PostgreSQL, inside the connection budget.
- A listing query is one indexed table scan, and listing freshness is tied to domain events.
- Suspending a shop removes its products from search on the next job run, with no separate index to purge.

**Negative**
- Relevance is basic: no synonyms, no transliteration between romanized and Devanagari Nepali, and typo tolerance limited to trigram similarity.
- Write amplification: every stock flip that changes `in_stock` rewrites a listing row.

**Risks**
- *The read model drifts from the source* because a job was lost or an event missed. Mitigation: transactional send, the nightly rebuild, and a consistency test.
- *Unbounded `%` queries on short strings* are slow. Mitigation: require `q` of at least 2 characters, and rate-limit the public catalogue at 120/min per IP.

## When to revisit

Move to a dedicated engine (R3) when **any** of these holds:
- more than 200,000 listing rows;
- search p95 above 300 ms at 10× launch load (T-PERF-001);
- R2 facet counts across more than 10 facets push listing p95 above 500 ms;
- autocomplete (R2) cannot meet 100 ms p95;
- the product needs synonyms or Nepali transliteration that PostgreSQL dictionaries cannot provide.

## Verification

- **T-PERF-001**: k6 listing and search scenarios at 10× launch load, with p95 targets from [docs/01](../01-product-requirements.md).
- **T-CAT suite** ([docs/10](../10-testing-and-quality-gates.md)):
  - publish, unpublish, block, suspend shop and stock-out each update or remove the listing row after the job runs;
  - a nightly rebuild on a consistent database produces zero diffs;
  - filter combinations return deterministic, duplicate-free pages;
  - an unknown filter parameter returns 400 `INVALID_QUERY_PARAMETER`.
- **Index-usage check**: an `EXPLAIN` test for the canonical listing and search queries asserts index scans on seeded data (guards against accidental sequential scans).

## Related

- [Domain model (product_listings)](../04-domain-model-and-data-dictionary.md)
- [API conventions (pagination, filtering)](../06-api-design.md)
- [UI/UX (filters in URL, infinite scroll)](../08-ui-ux-and-design-system.md)
- ADR-0008 (authoritative stock), ADR-0010 (refresh jobs), ADR-0017 (product URLs)

# ADR-0017: Product URLs by immutable public ID; slug is cosmetic; redirects for shop/category slugs

Status: Draft v1 (2026-09-25)

Reviewed: critic pass A4.3 (2026-09-25)

## Status

| Field              | Value                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted** for product URLs, shop and category slug redirects and canonical tags, and for the seller prefix `/seller/{shopSlug}` since OD-12 was decided on 2026-09-30. |
| Date               | 2026-09-25                                                                                                                                                                |
| Deciders           | Lead developer; product owner informed (OD-12 reverses a recent commit)                                                                                                   |
| Supersedes         | —                                                                                                                                                                         |
| Superseded by      | —                                                                                                                                                                         |
| Related open items | None open: OD-12 (seller dashboard prefix) and OD-13 (JSON casing) were decided on 2026-09-30; FR-SRCH-004, FR-SRCH-005, FR-SHOP-012, AC-FR-CAT-001-3                     |

## Context

**Repository today** [Verified-repo]:

- `products.name` and product slugs are globally `UNIQUE`, so two shops cannot both sell a "Black Hoodie" (audit F10, RF-17).
- The seller dashboard is one letter from the public shop page: the route is `/shop/:shopSlug/…` (`start/routes/shops.ts:27`), commit 0282605's title says `/shops/:shopSlug/dashboard`, and the public page is `/shops/{shopSlug}` (OD-12).

**How links travel.** Customers share product links in social media and chat apps. A link that breaks when a vendor fixes a typo is lost traffic and trust. Search engines need one canonical URL per page (AC-FR-SRCH-005-2), and the storefront is server-rendered (ADR-0003).

**Identifiers** ([04 §2.1](../04-domain-model-and-data-dictionary.md#21-identifiers)): `products.public_id` is 8 random Crockford base32 characters (no I, L, O or U), 32^8 ≈ 1.1 × 10^12 values, retried on collision. Internal UUIDs never appear in storefront URLs.

**HTTP facts** [Verified-doc, RFC 9110 §15.4.2, <https://www.rfc-editor.org/rfc/rfc9110.html>, accessed 2026-09-25]: after a 301, "a user agent MAY change the request method from POST to GET", and "a 301 response is heuristically cacheable".

## Decision

The slug rules are owned by [04 §2.8](../04-domain-model-and-data-dictionary.md#28-text-normalisation-and-lengths) and [04 §3.13](../04-domain-model-and-data-dictionary.md#313-slugs-and-redirects); the redirect table by [04a §6.10](../04a-data-dictionary-tables.md#610-slug_redirects).

1. **Product URLs are `/p/{slug}-{publicId}`** (AC-FR-SRCH-004-1).
   - Only `public_id` identifies the product: the router takes the 8 characters after the last hyphen (`/p/{publicId}` alone is accepted), ignores case and maps Crockford aliases (`o` → `0`, `i`/`l` → `1`), then runs one lookup on `products_public_id_key`.
   - The canonical form is the current slug plus the lowercase ID [Assumption on case]. Any other form (wrong, old or missing slug, other case) answers **301** to it.
   - An unknown ID, a product that is not `published`, or one whose shop is not `active` gets 404 (AC-FR-CAT-007-1). Malformed or overlong segments get 404, never 500.
2. **Product slugs are cosmetic**: generated from the title with `slugify`, `^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 80 characters (04 §2.8). A Devanagari-only title falls back to the category slug [Assumption]. Slugs are regenerated on title change, are not unique, and need no redirect rows. Titles are not unique either (AC-FR-CAT-003-4).
3. **The API takes the ID only.** `GET /api/v1/catalog/products/{publicId}` [getProduct] returns `public_id` and `slug`; clients build URLs with one helper, `productPath()`. Carts, orders and foreign keys use the UUID `id`; order items snapshot the title, not a URL.
4. **Shop and category slugs are the URL key** (`/shops/{shopSlug}`, `/c/{categorySlug}`, `/seller/{shopSlug}/…`).
   - Unique case-insensitively (`citext`); 3–40 characters, `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`, not on the reserved-word list in 04 §2.8 (AC-FR-SHOP-001-3). Brand slugs follow the same pattern.
   - In R1 only staff with `platform.shops.update` change a shop slug, via `adminUpdateShop` (AC-FR-SHOP-012-1). `updateShopProfile` rejects a `slug` field (T-SEC-003). Category slugs change only through staff seeders.
   - Every change inserts a `slug_redirects` row (`entity_type`, `old_slug`, `entity_id`, `created_by`) in the same transaction as the rename. Rows point straight at the entity (no chains); an old slug stays reserved for its entity; renaming back deletes that row.
5. **Resolving an old slug.** A slug that is not found falls back to `slug_redirects`.
   - **Pages** answer 301 to the same path with the current slug, including `/seller/{old}/…` (AC-FR-SHOP-012-2).
   - **API routes** (`/api/v1/shops/{shopSlug}`, `/api/v1/seller/shops/{shopSlug}/…`) resolve the old slug and serve the same shop without a redirect, because a 301 may turn a POST into a GET. The response carries the current `slug`; membership checks run as usual (ADR-0006).
6. **Redirect hygiene.** Every 301 carries `Cache-Control: public, max-age=86400` [Assumption], so a heuristically cached 301 plus a rename back cannot loop for more than a day. Redirects forward only the page's allow-listed query parameters (RF-37).
7. **Seller namespace (OD-12 option a, decided 2026-09-30).** The private dashboard is `/seller/{shopSlug}/…` and the public storefront `/shops/{shopSlug}`, so the `shopContext` middleware group (ADR-0006) attaches to one namespace and the RF-01 mistake (authentication checked, membership not) cannot recur. M0 moves the current `/shop/…` routes to `/seller`.
8. **SEO.** Every storefront page emits an absolute `<link rel="canonical">`: the product's canonical URL, or the unfiltered listing for filtered views. `/search` is `noindex`. `sitemap.xml` and JSON-LD `Product` use canonical URLs only (AC-FR-SRCH-005-2/3/4). `/seller`, `/account`, `/admin` and `/checkout` are `noindex` and disallowed in `robots.txt` [Assumption].

## Alternatives considered

| Alternative                                                | Why rejected                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Globally unique product slugs (`black-hoodie-7`), as today | Blocks common titles across shops, leaks how many shops sell an item, and still breaks links on rename. |
| `/shops/{shopSlug}/{productSlug}`, unique per shop         | A shop rename breaks every product URL; product renames need a redirect table; two lookups per request. |
| Sequential numeric IDs (`/p/12345`)                        | Leaks catalogue size and growth, and makes enumeration scraping trivial.                                |
| UUID in the URL                                            | 36 unreadable characters, poor for sharing or reading aloud to support.                                 |
| Slug history table for products                            | Unnecessary: the embedded ID resolves every old URL.                                                    |
| Self-service shop slug changes in R1                       | Rename-and-impersonate risk and broken shared links. Admin-only until abuse controls exist.             |

## Consequences

**Positive**

- Product links survive title edits indefinitely, with zero redirect rows for products; any number of shops can use the same title.
- One indexed lookup per product page.
- Shop and category renames keep old links working through one direct redirect row.
- Public and private namespaces cannot be confused by a middleware group.

**Negative**

- URLs end in an opaque 8-character token.
- A title change changes the canonical URL; search engines follow the 301 before re-indexing.
- Old shop slugs are reserved forever.
- Rewriting the current `/shop/...` routes (OD-12) costs M0 effort; there are no users to break.

**Risks**

- _Cached 301s loop after a rename back._ Bounded to one day by `max-age`; rename-backs are staff-only and rare.
- _`public_id` collisions._ The unique violation is caught and generation retried.

## When to revisit

- Brand or collection pages get their own URLs: add their entity type to `slug_redirects_entity_type_check`.
- Self-service shop slug changes are requested (R2), with rate limits and staff review.
- The R2 Nepali UI needs localised slugs or `hreflang` alternates.
- Search Console data shows the ID suffix hurting ranking or click-through.

## Verification

Tests are in the T-CAT, T-SHOP and T-UI areas ([10](../10-testing-and-quality-gates.md)); those without canon IDs are (proposed).

- **Product URL tests (proposed)**: wrong, old or missing slug, uppercase ID and alias form each return 301 with the exact canonical `Location`; unknown ID, unpublished product or suspended shop return 404; a malformed segment returns 404.
- **Redirect tests (proposed)**: only allow-listed query parameters survive (RF-37); every 301 carries `Cache-Control: public, max-age=86400`.
- **Shop rename (FR-SHOP-012)**: the `slug_redirects` row is written in the rename transaction; old `/shops/{old}` and `/seller/{old}/orders` return 301; another shop cannot take the old slug (AC-FR-SHOP-012-3); renaming back deletes the row; T-SHOP-104 (proposed) checks every redirect resolves.
- **T-SEC-001**: an old slug on `/api/v1/seller/shops/{old}` reaches the same shop, and a non-member still gets 404. **T-SEC-003**: a `slug` sent to `updateShopProfile` is rejected.
- **SEO (proposed)**: server-rendered HTML contains `<link rel="canonical">` (AC-J01-06); a CI crawl of the seeded sitemap finds every URL returns 200 without a redirect.
- **`public_id` generation (proposed)**: 10,000 IDs match `^[0-9A-HJKMNP-TV-Z]{8}$`, and a forced collision is retried.

## Related

- [04 §2.1 identifiers](../04-domain-model-and-data-dictionary.md#21-identifiers), [04 §2.8 slugs](../04-domain-model-and-data-dictionary.md#28-text-normalisation-and-lengths), [04 §3.13 slugs and redirects](../04-domain-model-and-data-dictionary.md#313-slugs-and-redirects)
- [04a §6.10 `slug_redirects`](../04a-data-dictionary-tables.md#610-slug_redirects)
- [01 FR-SHOP-012](../01-product-requirements.md#fr-shop-012-slug-change-by-admin-with-redirect), [01 §7.6 discovery and search](../01-product-requirements.md#76-discovery-and-search-fr-srch)
- [Risks and open decisions: OD-12](../risks-and-open-decisions.md#22-decision-table)
- [ADR-0003](0003-inertia-ssr-storefront-csr-dashboards.md) (SSR storefront), [ADR-0006](0006-authorization-platform-roles-shop-memberships.md) (`shopContext`), [ADR-0014](0014-postgres-search-and-listing-read-model.md) (read model carries `public_id` and `slug`)

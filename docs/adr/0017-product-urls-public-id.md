# ADR-0017: Product URLs by immutable public ID; slug is cosmetic; redirects for shop/category slugs

Status: Draft v1 (2026-09-25)

## Status

| Field              | Value                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted** for product URLs, shop and category slug redirects, and canonical tags. **Proposed** for the seller dashboard prefix `/seller/{shopSlug}`, pending **OD-12**. |
| Date               | 2026-09-25                                                                                                                                                                 |
| Deciders           | Tech lead (lead developer); product owner informed (OD-12 reverses a recent commit)                                                                                        |
| Supersedes         | —                                                                                                                                                                          |
| Superseded by      | —                                                                                                                                                                          |
| Related open items | **OD-12** (seller dashboard prefix), OD-13 (JSON casing of `public_id`); requirements FR-SRCH-004, FR-SRCH-005, FR-SHOP-012, AC-FR-CAT-001-3                               |

## Context

**Repository today** [Verified-repo, per [docs/04](../04-domain-model-and-data-dictionary.md) §3.13 and the ADR-0011 baseline table]:

- `products.name` is globally `UNIQUE`, and product slugs are unique too. Two shops therefore cannot both sell a "Black Hoodie" (F10, RF-17).
- The seller dashboard sits one letter away from the public shop page:
  - the route recorded in OD-12 is `/shop/:shopSlug/…` (start/routes/shops.ts:27);
  - the title of commit 0282605 says `/shops/:shopSlug/dashboard`;
  - the public page is `/shops/{shopSlug}`.

**How links travel.** Customers share product links in social media and chat apps. A link that breaks when a vendor fixes a typo in a title is lost traffic and lost trust. Search engines need one canonical URL per page (AC-FR-SRCH-005-2), and the storefront is server-rendered for them (ADR-0003).

**Existing identifiers** ([docs/04 §2.1](../04-domain-model-and-data-dictionary.md)):

- `products.public_id` is 8 random Crockford base32 characters. The alphabet `0-9 A-H J K M N P-T V-Z` has no I, L, O or U.
- That gives 32^8 ≈ 1.1 × 10^12 values. A collision is retried.
- Internal keys are UUIDs, which never appear in storefront URLs.

**HTTP facts** [Verified-doc, RFC 9110 §15.4.2, https://www.rfc-editor.org/rfc/rfc9110.html, accessed 2026-09-25]:

- "A user agent MAY change the request method from POST to GET" after a 301.
- "A 301 response is heuristically cacheable", which means browsers may keep it indefinitely.

## Decision

1. **Product URLs are `/p/{slug}-{publicId}`.**
   - **Identity.** Only `public_id` identifies the product. The router takes the 8 characters after the last hyphen, and `/p/{publicId}` with no slug is also accepted.
   - **Normalisation.** Matching ignores case, and Crockford aliases are mapped (`o` → `0`, `i`/`l` → `1`).
   - **Lookup.** One indexed query, `products WHERE public_id = ?` (`products_public_id_key`).
   - **Canonical form.** Current slug plus the lowercase public ID [Assumption on case]. Any other form (wrong or old slug, missing slug, different case) answers **301** to the canonical path.
   - **404.** An unknown ID gets 404, and so does a product that is not `published` or whose shop is not `active` (AC-FR-CAT-007-1, AC-FR-SRCH-003-2).
   - **Malformed paths.** Overlong segments and encoded slashes get 404, never 500.
2. **Product slugs are cosmetic.**
   - They are generated from the title: lowercase ASCII `[a-z0-9-]`, at most 60 characters [Assumption]. If the title yields nothing (for example a Devanagari-only title), the category slug is used.
   - A slug is regenerated when the title changes. It is not unique and needs no redirect rows, because the ID carries identity.
   - `products.title` is not unique (AC-FR-CAT-003-4).
3. **The API takes the ID only.**
   - `GET /api/v1/catalog/products/{publicId}` [getProduct] returns `public_id` and `slug`.
   - Clients build URLs with one shared helper, `productPath()`.
   - Carts, orders and foreign keys use the UUID `id`. Order items snapshot the title, not a URL.
4. **Shop and category slugs are the URL key.**
   - URLs: `/shops/{shopSlug}`, `/c/{categorySlug}`, `/seller/{shopSlug}/…`.
   - Slugs are unique case-insensitively (`citext`) and follow AC-FR-SHOP-001-3: 3–40 characters, `[a-z0-9-]`, and not on the reserved list (`admin`, `seller`, `api`, `p`, `c`).
   - **Who may change them.** In R1 only staff with `platform.shops.update` may change a shop slug, via [adminUpdateShop] (FR-SHOP-012). `updateShopProfile` rejects a `slug` field (T-SEC-003). Category slugs change only through staff seeders.
   - **Every change** inserts a `slug_redirects (entity_type, old_slug, entity_id, created_by)` row in the same transaction as the rename ([04a §6.10](../04a-data-dictionary-tables.md)).
     - Each row points straight at the entity, so there are no redirect chains.
     - An old slug stays reserved for its entity.
     - Renaming back to an old slug deletes that row.
5. **How an old slug resolves.** A slug that is not found falls back to `slug_redirects`.
   - **Pages** answer 301 to the same path with the current slug, including `/seller/{old}/orders/…` (AC-FR-SHOP-012-2).
   - **API routes** (`/api/v1/shops/{shopSlug}`, `/api/v1/seller/shops/{shopSlug}/…`) resolve the old slug to the same shop and serve it without a redirect. A 301 may turn a POST into a GET (RFC 9110). The response carries the current `slug`, and the dashboard client rebases its paths. Membership checks then run as usual (ADR-0006).
6. **Redirect hygiene.**
   - Every 301 carries `Cache-Control: public, max-age=86400` [Assumption]. Without it, a heuristically cached 301 plus a rename back to the old slug would loop in the browser indefinitely. With it, the loop lasts at most a day.
   - Redirects never forward the incoming query string, only the page's allow-listed parameters (RF-37).
7. **Seller namespace** (**Proposed, OD-12 option a**).
   - The private dashboard lives at `/seller/{shopSlug}/…`, and the public storefront at `/shops/{shopSlug}`.
   - Separate prefixes let the `shopContext` middleware group (ADR-0006) attach to one namespace. This avoids the RF-01 mistake, where authentication was checked but membership was not.
   - Until OD-12 closes, M0 builds `/seller` as the safe default.
8. **SEO.**
   - Every storefront page emits an absolute `<link rel="canonical">`: the product's canonical URL, or the unfiltered listing for filtered and sorted views (AC-FR-SRCH-005-2).
   - `/search` is `noindex`.
   - `sitemap.xml` and the JSON-LD `Product.url` use canonical URLs only (AC-FR-SRCH-005-3/4).
   - `/seller`, `/account`, `/admin` and `/checkout` are `noindex` and disallowed in `robots.txt` [Assumption].

## Alternatives considered

| Alternative                                                             | Why rejected                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Globally unique product slugs, as today (`black-hoodie-7` on collision) | Blocks common titles across shops. A numeric suffix leaks how many shops sell an item. Links still break on rename unless every product gets redirect rows.                  |
| `/shops/{shopSlug}/{productSlug}`, unique per shop                      | Readable, but a shop rename breaks every product URL, and a product rename needs a redirect table for products. Two lookups per request. Titles still collide within a shop. |
| Numeric sequential IDs (`/p/12345`)                                     | Leaks catalogue size and growth rate, and makes scraping by enumeration trivial. Not readable.                                                                               |
| UUID in the URL                                                         | 36 unreadable characters, poor for sharing and for reading aloud to support.                                                                                                 |
| Slug history table for products                                         | Unnecessary: the embedded ID already resolves every old URL.                                                                                                                 |
| Self-service shop slug changes in R1                                    | Rename-and-impersonate risk (taking a slug that resembles another brand) and broken shared links. Admin-only until abuse controls exist.                                     |

## Consequences

**Positive**

- Product links survive title edits indefinitely, with zero redirect rows for products.
- Any number of shops can use the same title.
- One indexed lookup per product page.
- Shop and category renames keep old links working through one direct redirect row.
- The public and private namespaces cannot be confused by a middleware group.

**Negative**

- URLs end in an opaque 8-character token.
- A title change changes the canonical URL, and search engines follow the 301 before re-indexing.
- Old shop slugs are reserved forever, a small namespace cost.
- Rewriting the current `/shop/...` routes (OD-12) costs M0 effort. There are no users to break.

**Risks**

- _Cached 301s loop after a rename back._ Bounded to one day by `max-age`; rename-backs are staff-only and rare.
- _public_id collisions at scale._ A collision raises a unique violation, and generation is retried.

## When to revisit

- Brand or collection pages get their own URLs: add their entity type to `slug_redirects_entity_type_check`.
- Self-service shop slug changes are requested (R2), with rate limits and staff review.
- The R2 Nepali UI needs localised slugs, or `hreflang` alternates.
- Search Console data shows the ID suffix hurting ranking or click-through.

## Verification

Tests are in the T-CAT, T-SHOP and T-UI areas ([docs/10](../10-testing-and-quality-gates.md)).

- **Product URL tests** (AC-FR-SRCH-004-1):
  - a wrong slug, an old slug, a missing slug, an uppercase ID and an alias form each return 301 with the exact canonical `Location`;
  - an unknown ID, an unpublished product or a product of a suspended shop returns 404;
  - a malformed segment returns 404, not 500.
- **Redirects** keep only allow-listed query parameters (RF-37) and carry `Cache-Control: public, max-age=86400`.
- **Shop rename test** (FR-SHOP-012):
  - the `slug_redirects` row is written in the same transaction as the rename;
  - old `/shops/{old}` and `/seller/{old}/orders` return 301;
  - another shop cannot take the old slug (AC-FR-SHOP-012-3);
  - renaming back deletes the row;
  - T-SHOP-104 (proposed) checks that every redirect resolves.
- **API resolution:** an old slug on `/api/v1/seller/shops/{old}` reaches the same shop. A non-member still gets 404 (T-SEC-001).
- **Mass assignment:** a `slug` field sent to `updateShopProfile` is rejected (T-SEC-003).
- **SEO:** server-rendered HTML contains `<link rel="canonical">` (AC-J01-06). A CI crawl of the seeded sitemap finds every URL returns 200 with no redirect.
- **public_id generation:** 10,000 generated IDs match `^[0-9A-HJKMNP-TV-Z]{8}$`, and a forced collision is retried.

## Related

- [Domain model §2.1 identifiers, §3.13 slugs and redirects](../04-domain-model-and-data-dictionary.md)
- [Data dictionary §6.10 `slug_redirects`](../04a-data-dictionary-tables.md)
- [Product requirements: FR-SRCH-004, FR-SRCH-005, FR-SHOP-012](../01-product-requirements.md)
- [Risks and open decisions: OD-12](../risks-and-open-decisions.md)
- ADR-0003 (SSR storefront), ADR-0006 (`shopContext` resolution), ADR-0014 (listing read model carries `public_id` and `slug`)

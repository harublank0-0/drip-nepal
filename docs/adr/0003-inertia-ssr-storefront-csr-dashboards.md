# ADR-0003: Inertia (React) for all three surfaces; SSR for the storefront, CSR for dashboards

Status: Draft v1 (2026-09-25)

Reviewed: 2026-09-25 · consistency review 2026-09-30 to 2026-10-01

## Status

| Field              | Value                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Decision status    | **Accepted**                                                                                                                                                                                                       |
| Date               | 2026-09-25                                                                                                                                                                                                         |
| Deciders           | Lead developer, product owner                                                                                                                                                                                      |
| Supersedes         | —                                                                                                                                                                                                                  |
| Superseded by      | —                                                                                                                                                                                                                  |
| Related open items | OD-25 (upgrade to @adonisjs/inertia 5 + @inertiajs/react 3 + @adonisjs/vite 6), decided 2026-09-30: a time-boxed spike at the start of M0, staying on 4.2.0 if it fails. This decision holds under either version. |

Edited 2026-09-30 (consistency review): decision 6 and the history-encryption context follow [07 §3.11](../07-security-threat-model-and-permissions.md#311-logout-and-inertia-history); the decision is unchanged.

## Context

DripNepal has three UI surfaces: the **public storefront** (SEO, fast first paint on congested mobile networks), the **seller dashboard** (`/seller/{shopSlug}/…`, OD-12) and the **platform admin** (`/admin/…`). Auth and account pages sit between them.

**Installed stack** [Verified-repo, `pnpm-lock.yaml`]: @adonisjs/inertia 4.2.0, @inertiajs/react 2.3.27, React 19.2.7, Vite 7, Tailwind 4.3.1.

**SSR is broken today (RF-08)** [Verified-repo]: `config/inertia.ts:11` enables SSR but `vite.config.ts:11` disables it in the Vite plugin, which in adapter 4.2.0 is the only thing that builds the SSR bundle the production server imports [Verified-doc, [research: adonis-stack](../research/adonis-stack.md), 4.2.0 package source]. `inertia/app.tsx:30` calls `createRoot`, not `hydrateRoot`, so server HTML is discarded; the theme is applied only after JavaScript runs.

**Per-page SSR is supported.** @adonisjs/inertia 4.2.0 accepts `ssr.pages` as `string[]` or `(ctx, page) => boolean` [Verified-doc, https://cdn.jsdelivr.net/npm/@adonisjs/inertia@4.2.0/build/src/types.d.ts, accessed 2026-09-25]; the current guide documents the same option [Verified-doc, https://docs.adonisjs.com/guides/frontend/inertia, accessed 2026-09-25].

**Requirements.** FR-SRCH-005 requires SSR, canonical URLs, a sitemap and JSON-LD. NFR-PERF-001 (LCP p75 ≤ 2.5 s, INP p75 ≤ 200 ms, CLS ≤ 0.1) and NFR-PERF-002 (≤ 250 KB gzip initial storefront JS per route) are owned by [01 §8](../01-product-requirements.md#8-non-functional-requirements) [A-25]. Seller and admin pages have no SEO value; rendering them on the server spends CPU on the small host proposed in ADR-0016.

**Inertia versions.** Inertia v3 is the default and v2 is on the npm `legacy` tag; adapter 5 needs @inertiajs/react ^3.4 and @adonisjs/vite ^6 [Verified-doc, https://github.com/adonisjs/inertia/releases, accessed 2026-09-25]. Adapter 4.2.0 already has `encryptHistory` and `clearHistory()`, which keep private pages out of history on shared phones; history encryption needs a secure context, that is HTTPS or a loopback origin such as `localhost` [Verified-doc, https://inertiajs.com/docs/v2/security/history-encryption, accessed 2026-09-25; https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts, accessed 2026-09-28].

## Decision

1. **Inertia + React for every surface**, in one Vite build sharing `inertia/components/ui`. No second frontend application.
2. **SSR only where it pays.** `config/inertia.ts` sets `ssr.pages` to a function that is true for page components under `storefront/`, `auth/` and `payments/`. The route list per surface is owned by [03 §6.1](../03-system-architecture.md#61-surfaces-and-rendering-modes): storefront pages (including navigation entries such as `/men/t-shirts` and `/grievance`), auth pages including `/mfa`, and the provider return page `/payments/{provider}/return` [Assumption for auth and return pages: entry points from email and checkout, cheap to render]. `account/`, `seller/` and `admin/` pages render client-side.
3. **Fix RF-08 in M0.** Enable the Vite plugin's `ssr.enabled`; the client entry hydrates when the root element has server markup and mounts otherwise (`el.hasChildNodes() ? hydrateRoot(…) : createRoot(…)` [Assumption, checked by T-ARCH-002]); `inertia/ssr.tsx` globs only SSR-eligible pages so dashboard code stays out of the SSR bundle; the theme class comes from a cookie on the server.
4. **SSR-safety rules for shared components.** No `window`, `localStorage` or `matchMedia` during render. Money and dates use the one shared formatter with an explicit locale (`en-IN`, NPR, `Asia/Kathmandu`; ADR-0007) so Node and browser output match. Browser-only widgets (charts, drag and drop) appear only on CSR pages.
5. **Slow-network data loading** ([08](../08-ui-ux-and-design-system.md)): SEO-critical product data (title, price, availability, main image) is in the initial props, never deferred; below-the-fold data uses `inertia.defer()` with few groups; product cards use `prefetch="click"`, not hover.
6. **Private-page hygiene.** `encryptHistory` for every authenticated surface (`/account`, `/seller`, `/admin`, `/checkout`). The client's `logOut` success handler calls `router.clearHistory()`, and the server renders `/login`, `/mfa` and every page for a guest with `inertia.clearHistory()` ([07 §3.11](../07-security-threat-model-and-permissions.md#311-logout-and-inertia-history), ADR-0005).
7. **Version.** Examples target @adonisjs/inertia 4.2.0 and Inertia v2 until OD-25 closes. An upgrade changes APIs (`useHttp`, `once()`, the removed `@adonisjs/inertia/vite` plugin) but not this decision.

## Alternatives considered

| Alternative                                                 | Why rejected                                                                                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js storefront + Adonis API                             | Two runtimes, two deployments, session and CSRF shared across apps; about 6–10 developer-weeks to migrate later [Assumption, 03 §6.4]. Shadcn UI Kit dashboards being Next.js apps is not a reason (ADR-0015). |
| SSR for every page                                          | Spends CPU on authenticated dashboards with no SEO value; larger SSR bundle and more hydration-mismatch surface.                                                                                               |
| CSR for every page (SPA)                                    | Fails FR-SRCH-005; crawlers and link previews get an empty shell; first paint waits for the whole bundle.                                                                                                      |
| Separate React Router SPA for seller and admin on `/api/v1` | A second routing, auth-redirect and build setup; Inertia already gives server-driven routing with session auth.                                                                                                |
| Server-only Edge templates for the storefront               | The variant picker, cart and filters need React anyway; components would be duplicated.                                                                                                                        |

## Consequences

**Positive**

- Storefront pages arrive as HTML: indexable, previewable, painted before JavaScript downloads.
- Seller and admin pages cost no SSR CPU; table and chart libraries never enter the SSR bundle.
- One component library and one form stack (TanStack Form) across surfaces.

**Negative**

- Two rendering modes: shared components must be SSR-safe, and reviewers must know which pages SSR.
- SSR runs in the `web` process; a render exception or leak affects every storefront request on that instance.
- Adapter 4.2.0 and Inertia v2 are the legacy line, so current Adonis doc examples do not compile as-is (OD-25, R-22).

**Risks**

- _Silent SSR build failure_ (RF-08 appears only in production builds). Mitigation: T-ARCH-002.
- _Hydration mismatches_ from ICU differences between Node and browsers [Assumption; unquantified]. Mitigation: explicit-locale formatting and a browser check for hydration warnings.

## When to revisit

- `web` CPU above 70 % at peak with SSR as the main consumer, or storefront TTFB p75 above 800 ms from Nepal [Assumption thresholds, 03 §6.4]: first edge-cache anonymous HTML (03 §12.5); then consider a separate SSR process; a Next.js storefront only if that is not enough.
- The OD-25 upgrade spike passes (OD-25, decided 2026-09-30): update code and examples; the decision stays.
- A native mobile app (R3): it uses `/api/v1` with token auth (ADR-0004, ADR-0005), not Inertia.
- A dashboard page must become publicly shareable: add it to `ssr.pages`.

## Verification

- **T-ARCH-002** (proposed; production-build SSR smoke, [03 §6.1](../03-system-architecture.md#61-surfaces-and-rendering-modes)): `node ace build`, boot the built server against CI Postgres, request `/`, a category page and `/p/{slug}-{publicId}`; assert 200 and server markup with the product title and canonical `<link>`; request a `/seller/…` page and assert an empty root element.
- **T-A11Y-001**: axe checks on SSR storefront and CSR dashboard pages.
- **T-PERF-001**: k6 load on listing and product pages; Lighthouse CI for NFR-PERF-001 and the bundle-size gate for NFR-PERF-002 ([10](../10-testing-and-quality-gates.md)).
- **Browser suite** (proposed): no React hydration warnings on home, listing, product, cart and checkout.

## Related

- [03 §6 Frontend architecture](../03-system-architecture.md#6-frontend-architecture) · [08 UI/UX](../08-ui-ux-and-design-system.md) · [01 FR-SRCH-005, NFR-PERF](../01-product-requirements.md)
- [ADR-0004](0004-inertia-reads-json-api-writes.md) (reads via props), [ADR-0005](0005-session-auth-server-side-revocation.md) (logout clears history), [ADR-0007](0007-money-integer-minor-units.md) (formatter), [ADR-0015](0015-ui-foundation-shadcn-and-kit-policy.md) (UI foundation), [ADR-0017](0017-product-urls-public-id.md) (product URLs)

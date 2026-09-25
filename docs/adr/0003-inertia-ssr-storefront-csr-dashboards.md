# ADR-0003: Inertia (React) for all three surfaces; SSR for the storefront, CSR for dashboards

Status: Draft v1 (2026-09-25)

## Status

| Field              | Value                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Decision status    | **Accepted**                                                                                                             |
| Date               | 2026-09-25                                                                                                               |
| Deciders           | Lead developer, product owner                                                                                            |
| Supersedes         | —                                                                                                                        |
| Superseded by      | —                                                                                                                        |
| Related open items | OD-25: upgrade to @adonisjs/inertia 5 + @inertiajs/react 3 + @adonisjs/vite 6. This decision holds under either version. |

## Context

DripNepal has three UI surfaces:

- the **public storefront**, which needs SEO and fast first paint for customers on mobile networks;
- the **seller dashboard** (`/seller/{shopSlug}/…`, OD-12);
- the **platform admin** (`/admin/…`).

Customer account and auth pages sit between them.

**Installed stack** [Verified-repo, `pnpm-lock.yaml`]: @adonisjs/inertia 4.2.0, @inertiajs/react 2.3.27, React 19.2.7, Vite 7, Tailwind 4.3.1.

**The current SSR setup is broken (RF-08, audit A5-03, A3-09)** [Verified-repo]:

- `config/inertia.ts:11` sets `ssr.enabled: true`, but `vite.config.ts:11` passes `inertia({ ssr: { enabled: false, … } })`.
- In adapter 4.2.0 the SSR bundle is built only when the Vite plugin's flag is true, and in production the server imports that bundle for every SSR page. After `node ace build`, every full page load, including the 500 error page, would fail.
- `inertia/app.tsx:30` calls `createRoot`, not `hydrateRoot`, so the server HTML is thrown away and re-rendered on the client.
- The theme class is applied only after JavaScript runs.

**Per-page SSR is supported.** @adonisjs/inertia 4.2.0 `defineConfig` accepts `ssr.pages` as `string[]` or `(ctx, page) => boolean` [Verified-doc, @adonisjs/inertia 4.2.0 `build/src/types.d.ts`, https://registry.npmjs.org/@adonisjs/inertia/-/inertia-4.2.0.tgz, accessed 2026-09-25]. The current AdonisJS guide, which targets adapter 5, documents the same option [Verified-doc, https://docs.adonisjs.com/guides/frontend/inertia, accessed 2026-09-25]. The brief's open question, "SSR disabled per page if supported — verify", is therefore resolved: it is supported.

**Requirements.**

- FR-SRCH-005 requires SSR, canonical URLs, a sitemap and JSON-LD for the storefront (R1).
- The proposed performance targets are LCP p75 ≤ 2.5 s, INP p75 ≤ 200 ms, CLS ≤ 0.1 and initial storefront JS ≤ 250 KB gzip per route [Assumption; texts owned by [docs/01](../01-product-requirements.md)].
- Seller and admin pages have no SEO value. Rendering them on the server spends CPU on the single small VPS proposed in ADR-0016.

**Inertia versions.** Inertia v3 is now the default and v2 is on the npm `legacy` tag. Adapter 5 requires @inertiajs/react ^3.4 and @adonisjs/vite ^6 [Verified-doc, https://www.npmjs.com/package/@adonisjs/inertia, accessed 2026-09-25]. Adapter 4.2.0 has `encryptHistory` and `clearHistory()`, which keep private pages out of browser history on shared phones [Verified-doc, adapter 4.2.0 `inertia_manager`; https://inertiajs.com/docs/v2/security/history-encryption, accessed 2026-09-25].

## Decision

1. **Keep Inertia + React for every surface.** Storefront, auth, account, seller and admin pages are Inertia pages in one Vite build, sharing `inertia/components/ui`. There is no second frontend application.
2. **SSR only where it pays.** `config/inertia.ts` sets `ssr.pages` to a function that returns true for page components under:
   - `storefront/`: `/`, `/men`, `/women`, `/c/{categorySlug}`, `/search`, `/p/{slug}-{publicId}`, `/shops/{shopSlug}`, `/cart`, `/checkout`, `/checkout/complete/{orderNumber}`;
   - `auth/`: `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`. [Assumption: auth pages are reached from emails and shared links on phones and are cheap to render.]

   `account/`, `seller/` and `admin/` pages render client-side.

3. **Fix RF-08 in M0.**
   - Set the Vite plugin's `ssr.enabled` to `true`.
   - The client entry hydrates when the root element already contains server markup and mounts otherwise (`el.hasChildNodes() ? hydrateRoot(...) : createRoot(...).render(...)`).
   - The SSR entry (`inertia/ssr.tsx`) globs only SSR-eligible pages, so dashboard code stays out of the SSR bundle.
   - The theme class is resolved from a cookie on the server so there is no flash.
4. **SSR-safety rules for shared components.**
   - No `window`, `localStorage` or `matchMedia` during render.
   - Money and dates go through the one shared formatter with an explicit locale (`en-IN`, NPR, `Asia/Kathmandu`; ADR-0007), so the Node 24 ICU output and browser output match during hydration.
   - Browser-only widgets (charts, drag and drop) are client-only and appear only on CSR pages.
5. **Data loading on slow networks** (details in [docs/08](../08-ui-ux-and-design-system.md)):
   - SEO-critical product data (title, price, availability, images) is in the initial props.
   - Below-the-fold data uses `inertia.defer()`, with at most two defer groups per page.
   - Product-card links use `prefetch="click"`, not hover prefetch.
6. **Private-page hygiene.** `encryptHistory` is enabled for `account/`, `seller/` and `admin/` pages. Logout calls `inertia.clearHistory()` (ADR-0005).
7. **Version pin.** Code and docs target @adonisjs/inertia 4.2.0 and Inertia v2 until OD-25 is decided. An upgrade to adapter 5 and Inertia v3 changes APIs (`useHttp`, `once()`, renamed events) but not this decision.

## Alternatives considered

| Alternative                                                              | Why rejected                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js (RSC) storefront + Adonis API backend                            | Two runtimes, two deployments and duplicated session/CSRF handling, all for 1–2 developers. Shadcn UI Kit dashboards being Next.js apps is not a reason (ADR-0015 treats them as reference only). |
| SSR for every page                                                       | Spends VPS CPU on authenticated dashboards with no SEO value. It also enlarges the SSR bundle and the hydration-mismatch surface (locale, dates, theme).                                          |
| CSR for every page (SPA)                                                 | Fails FR-SRCH-005. Crawlers and link previews get an empty shell, and first paint on slow mobile connections waits for the full JS bundle.                                                        |
| Separate React Router SPA for seller and admin, consuming only `/api/v1` | A second routing, auth-redirect and build setup. Inertia already provides server-driven routing with session auth.                                                                                |
| Server-only Edge templates for the storefront                            | The variant picker, cart and filters need React anyway, and the components would be duplicated.                                                                                                   |

## Consequences

**Positive**

- Storefront pages arrive as HTML: indexable, previewable, and painted before JavaScript downloads. This matters most on congested mobile networks.
- Seller and admin pages cost no SSR CPU, and dashboard libraries such as tables and charts never enter the SSR bundle.
- One component library and one form stack (TanStack Form) across all surfaces.

**Negative**

- Two rendering modes. A component used on both kinds of page must be SSR-safe, and reviewers must know which pages SSR.
- SSR runs in the `web` process. A render-time exception or memory leak affects every storefront request on that instance.
- Adapter 4.2.0 and Inertia v2 are now the legacy line, so examples in current Adonis docs will not compile as-is (OD-25).

**Risks**

- _Silent SSR build failure_ (RF-08 shows it happens only in production builds). Mitigation: the CI production-build smoke test below.
- _Hydration mismatches_ from ICU data differences between Node and browsers (unquantified; `ui_frontend` research). Mitigation: explicit locale formatting, and Playwright checks for hydration warnings on core pages.

## When to revisit

- SSR render p95 exceeds 150 ms, or `web` CPU stays above 70 % at peak with SSR as the main consumer. Then first cache anonymous catalog HTML at the CDN with a short TTL; if that is not enough, run SSR as a separate process.
- OD-25 is decided in favour of the upgrade. Update code and examples; the decision stays.
- A native mobile app (R3) is planned. It uses `/api/v1` with token auth (ADR-0004, ADR-0005), not Inertia.
- Dashboard pages need to be publicly shareable, for example public shop statistics. Then add those pages to `ssr.pages`.

## Verification

- **Production-build smoke test** (CI gate in [docs/10](../10-testing-and-quality-gates.md)): `node ace build`, boot the built server against the CI Postgres, then:
  - request `/`, a category and `/p/{slug}-{publicId}`, and assert HTTP 200 plus server-rendered markup containing the product title and a canonical `<link>`;
  - request a `/seller/...` page and assert the root element is empty (CSR).
- **T-A11Y-001**: axe checks on SSR storefront pages and CSR dashboard pages.
- **T-PERF-001**: k6 load on the listing and product pages, recording SSR latency.
- **Browser tests** (Japa browser suite): no React hydration warnings in the console on home, listing, product detail, cart and checkout.

## Related

- [UI/UX specification](../08-ui-ux-and-design-system.md)
- [Architecture](../03-system-architecture.md)
- [Requirements (FR-SRCH-005, NFR-PERF)](../01-product-requirements.md)
- ADR-0004 (reads via Inertia props), ADR-0005 (logout clears history), ADR-0007 (formatter), ADR-0015 (UI foundation), ADR-0017 (product URLs)

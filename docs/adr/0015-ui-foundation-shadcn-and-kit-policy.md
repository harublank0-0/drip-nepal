# ADR-0015: UI foundation: shadcn/ui core + DripNepal-owned composed blocks; Shadcn UI Kit free items only after written licence clarification; remove commercn

Status: Draft v1 (2026-09-25)

## Status

| Field              | Value                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted.** The policy is written to hold whatever the open items decide: kit use is gated on them rather than assumed.                                                                         |
| Date               | 2026-09-25                                                                                                                                                                                        |
| Deciders           | Product owner (Q7), lead developer                                                                                                                                                                |
| Supersedes         | —                                                                                                                                                                                                 |
| Superseded by      | —                                                                                                                                                                                                 |
| Related open items | **VX-13** (Shadcn UI Kit free-tier terms for a public repository), **OD-22** (repo visibility and kit tier), OD-23 (LICENSE says MIT while package.json says UNLICENSED), OD-25 (Inertia upgrade) |

## Context

**Product-owner answer, Q7** [Confirmed 2026-09-25]: "Remove the `@commercn` registry. Use shadcn/ui core + ONLY the free components of Shadcn UI Kit (shadcnuikit.com). Premium blocks are visual reference only (repo is PUBLIC on GitHub with an MIT LICENSE file)."

**Repository** [Verified-repo]:

- `components.json` uses style `radix-nova`, `rsc: false`, aliases `~/components/ui` and `~/lib/utils`, and `iconLibrary: lucide`.
- Its only registry entry is `"@commercn": "https://commercn.com/r/{name}.json"` (line 25). No file under `inertia/` imports commercn code, so removal is safe (RF-39).
- `inertia/components/commerce` (cart, checkout, including the multi-shop `cart_store_group.tsx`) is custom code.
- Forms use TanStack Form. The shadcn CLI is locked at 4.11.0.
- The repository is public with an MIT `LICENSE`, while `package.json` says `UNLICENSED` (OD-23).

**Shadcn UI Kit facts** [Verified-doc, https://shadcnuikit.com/pricing, https://shadcnuikit.com/blocks, https://shadcnuikit.com/components, https://shadcnuikit.com/llms.txt, accessed 2026-09-25]:

- **Publisher.** Published by Bundui, an independent product "not affiliated with the official shadcn/ui project".
- **Tiers** (one-time payment, sale prices as published on 2026-09-25): Starter $0; Pro $79 (1 user); Team $199 (10 users); Enterprise $499 (unlimited users).
- **Licence restriction.** The pricing FAQ says: "You cannot use the premium components or templates in an open-source project where the source code is publicly available … You may only use them in closed-source projects." Premium code therefore cannot be committed to this repository as it stands.
- **No licence agreement.** `/license` returns 404, and `/terms-conditions` contains no licence grant. Free items are described as "free to copy and use in personal and commercial projects" but carry **no open-source licence**, and the free GitHub repository has no LICENSE file. Committing even free items to a public MIT repository is therefore legally unclear: low risk, but not formally licensed (VX-13).
- **All 59 ecommerce blocks are Pro:** checkout 1–5, product list 1–8, product category 1–9, product cards 1–11, product details 1–7, shopping cart 1–4, customer reviews 1–9, quickview 1–2, promo section, store navigation, product features. The only free Dashboard UI blocks are **Sign In Form 1, Stat Card 1, Table 1 and Modal Dialog 16**. 527 of 532 component variants are free.
- **Registry quirks.** The registry is `@shadcnuikit` → `https://shadcnuikit.com/r/{name}.json`. Pro items need an `Authorization: Bearer ${SHADCNUIKIT_API_KEY}` header in `components.json`.
  - Items declare **no** `dependencies` or `registryDependencies`, and hard-code the target `components/<name>.tsx` at the repo root, outside `inertia/`. `-p` does not redirect them.
  - The official shadcn directory marks `@shadcnuikit` as "degraded", mainly for installability (https://ui.shadcn.com/r/registries.json).
  - `/r/stat-card1.json` serves a different card from the one the Stat Card page claims to install.
  - Three items labelled Pro (promo-section, store-navigation, sidebar-layout) are downloadable without authentication. Being downloadable does not make them licensed.
- **Framework coupling.**
  - The admin dashboard templates are **Next.js 16 App Router** apps (next/link, next/navigation, next/font, next-themes, server components, `proxy.ts`), so they must be ported, not installed.
  - Page Builder export targets Next.js only.
  - Of the 556 public registry items, 22 import `next/image` or `next/link`.
  - Block forms use React Hook Form + Zod, or Formisch + Valibot.
- **Licence limits and accessibility.** The licence bars "tools that allow others to build sites using Shadcn UI Kit components directly". There is no WCAG conformance statement.

**shadcn/ui facts** [Verified-doc, `ui_frontend` research, accessed 2026-09-25]:

- There is no `upgrade` command. `shadcn add <c> --diff` compares a copied component with upstream (https://ui.shadcn.com/docs/cli).
- `style` cannot be changed after init (https://ui.shadcn.com/docs/components-json).
- Base UI has been the default for new projects since 2026-07-02, but Radix "is not being deprecated".
- Since 2026-09-03, registry components import `cn` from the `cn` npm package. `migrate cn` needs a newer CLI than 4.11.0.

**CommerCN** (for the record): the README says MIT, but there is no LICENSE file. Its 17 blocks contain 0 `aria-label` and 0 `sr-only` occurrences, and 13 icon-only buttons have no accessible name.

## Decision

1. **Remove `@commercn`** from `components.json` in M0. No code changes are needed.
2. **Primitives: shadcn/ui core, `radix-nova`.** Components are copied into `inertia/components/ui` and owned by the repo, with minimal local edits so upstream diffs stay readable. Once a quarter, a chore runs `pnpm dlx shadcn@<pinned> add <component> --diff` for each primitive and merges changes by hand. Any re-init passes `-b radix` explicitly.
3. **`cn` has a single import path.** `~/lib/utils` stays the only import path. If new primitives bring the `cn` package, `~/lib/utils` re-exports it rather than having two sources [Assumption; lead developer, M0].
4. **Storefront commerce blocks are DripNepal-owned components**, in `inertia/components/<domain>/` (commerce, catalog, orders), composed from shadcn primitives. The existing `inertia/components/commerce` is the starting point. This covers: product card, gallery, variant and size picker, cart grouped by shop, checkout steps, filters, order timeline, seller order table.
   - Premium Shadcn UI Kit blocks are **visual reference only**: developers may look at the public demos but never copy, download or paste their code.
5. **Shadcn UI Kit free items are gated on VX-13.** Nothing from `@shadcnuikit`, not even free items, is committed until Bundui (contact@shadcnuikit.com) confirms **in writing** that free items may be redistributed in a public MIT-licensed repository. The reply is stored with the risk register.
   - If confirmed, free items (Sign In Form 1, Stat Card 1, Table 1, Modal Dialog 16, free component variants) are added with `--dry-run`/`--view` first.
   - They are moved from the repo-root `components/` into `inertia/components/kit/`, with a provenance header (source URL, date, licence reference).
   - Missing shadcn primitives and npm dependencies are added by hand.
   - `next/link`/`next/image` are replaced with the Inertia `Link` and the project `Image` component.
   - Form logic is rewired to TanStack Form.
   - Each item gets an accessibility review.
6. **Premium kit code is never committed while the repository is public.** Making the repository private and buying Pro or Team (OD-22) would be a new, superseding ADR. Such an ADR would have to count seats, keep `SHADCNUIKIT_API_KEY` in env only, and settle whether private submodules count as "closed-source" (unverified).
7. **Kit dashboards and Page Builder output are reference only.** They are Next.js apps, and are never ported wholesale into the seller or admin surfaces. DripNepal will not build a vendor storefront or page-builder feature out of kit blocks, because of the licence restriction on builder tools.
8. **Third-party registry hygiene.**
   - Every `shadcn add` from a non-official registry is previewed with `--dry-run`.
   - Diffs to `components.json` get explicit review, because the registry docs contradict themselves on automatic registry discovery.
   - Tokens are only ever written as `${VAR}`.
9. **Accessibility baseline** is WCAG 2.2 AA (details in [docs/08](../08-ui-ux-and-design-system.md)). On the mobile storefront, icon buttons use shadcn size `icon` (32 px) or larger, and primary checkout actions are at least 44 px high, above the 24×24 px minimum of SC 2.5.8 [Verified-doc, https://www.w3.org/TR/WCAG22/, accessed 2026-09-25].

## Alternatives considered

| Alternative                                                                                          | Why rejected                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep `@commercn`                                                                                     | Rejected by Q7. It has only a README MIT claim with no LICENSE file, missing accessible names, undeclared dependencies, and blocks designed for `new-york`, not `radix-nova`.     |
| Buy Pro/Team and commit premium code to the public repo                                              | Explicitly barred by the vendor's FAQ.                                                                                                                                            |
| Make the repo private and buy Pro ($79, 1 user) or Team ($199, 10 users), as published on 2026-09-25 | A valid option, but it is the product owner's call (OD-22) and not made yet. Even then, the ecommerce blocks would need porting and form rewiring.                                |
| Keep premium code in a private package or submodule consumed by the public repo                      | Unverified whether that satisfies "closed-source" (VX-13). The built client bundle ships the code publicly anyway.                                                                |
| Other kits (bundui.io, MUI, Chakra)                                                                  | bundui.io ecommerce items are flagged `isPro` despite being publicly served, with unclear terms. MUI and Chakra bring a second design system and larger bundles on slow networks. |
| Switch to Base UI or React Aria styles                                                               | `style` cannot change after init. Radix is supported, and a migration buys nothing for R1.                                                                                        |

## Consequences

**Positive**

- The public repository stays licence-clean. Every UI file is either our own, shadcn/ui (MIT), or explicitly cleared.
- Commerce components are built around DripNepal's actual flows (multi-shop cart, COD, per-shop status) instead of generic single-store demos.
- One form stack (TanStack Form) and one component style across all surfaces.

**Negative**

- More in-house UI work. The kit's free tier contributes almost nothing to the storefront, and little to dashboards (one table, one stat card, one sign-in form, one modal).
- Provenance headers and manual dependency installs add friction if kit items are cleared.

**Risks**

- _A developer copies Pro code from a demo "for reference"._ Mitigation: the CI checks below and a PR checklist item.
- _A negative VX-13 answer_ only removes the 4 free blocks and free variants. Impact is low because shadcn core covers them.

## When to revisit

- OD-22 decides "private + paid tier": write a superseding ADR.
- VX-13 answered: update this ADR's Verification section with the stored reply, or record the refusal.
- Dashboard work takes more than 10 developer-days that premium blocks would have covered: re-open OD-22 with that data.
- Radix support in shadcn is deprecated, or OD-25's Inertia upgrade changes `Link`/`Head` usage in components.

## Verification

- **CI grep checks** ([docs/10](../10-testing-and-quality-gates.md)):
  - `components.json` contains no `@commercn`;
  - any `@shadcnuikit` headers use `${SHADCNUIKIT_API_KEY}` and never a literal token;
  - no file under repo-root `components/` exists;
  - no import from `next/*` anywhere under `inertia/` (ESLint `no-restricted-imports`);
  - every file under `inertia/components/kit/` starts with a provenance header.
- **T-A11Y-001**: axe checks on core storefront, seller and admin pages. **T-UI suite**: icon buttons have accessible names, and targets on storefront pages are at least 24 px.
- **Licence audit**: the npm dependency licence report runs in CI (any non-permissive licence fails the build). The VX-13 reply is linked from the risk register before `inertia/components/kit/` may be non-empty.

## Related

- [UI/UX specification](../08-ui-ux-and-design-system.md)
- [Code structure (component folders)](../09-code-structure-and-engineering-standards.md)
- [Risks and open decisions (VX-13, OD-22, OD-23)](../risks-and-open-decisions.md)
- ADR-0003 (Inertia surfaces)

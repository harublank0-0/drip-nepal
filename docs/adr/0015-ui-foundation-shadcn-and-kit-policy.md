# ADR-0015: UI foundation: shadcn/ui core + DripNepal-owned composed blocks; Shadcn UI Kit free items only after written licence clarification; remove commercn

Status: Draft v1 (2026-09-25)

Reviewed: critic pass A4.3 (2026-09-25)

## Status

| Field              | Value                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted** (from Q7). Committing any kit item is gated on **VX-13**; the policy holds for OD-22 option (a), and option (b) would need a superseding ADR.                  |
| Date               | 2026-09-25                                                                                                                                                                  |
| Deciders           | Product owner (Q7), lead developer                                                                                                                                          |
| Supersedes         | —                                                                                                                                                                           |
| Superseded by      | —                                                                                                                                                                           |
| Related open items | **VX-13** (free kit items in a public MIT repo), **OD-22** (repo visibility and kit tier), OD-23 (decided 2026-09-30: keep MIT; M0 sets `package.json` to MIT), OD-25, R-15 |

## Context

**Q7** [Confirmed 2026-09-25]: "Remove the `@commercn` registry. Use shadcn/ui core + ONLY the free components of Shadcn UI Kit (shadcnuikit.com). Premium blocks are visual reference only (repo is PUBLIC on GitHub with an MIT LICENSE file)."

**Repository** [Verified-repo]: `components.json` uses style `radix-nova`, `rsc: false`, aliases `~/components/ui` and `~/lib/utils`, and `iconLibrary: lucide`. Its only registry is `@commercn` (line 25), and no file imports commercn code, so removal is safe (RF-39). `inertia/components/commerce` (including the multi-shop `cart_store_group.tsx`) is custom code. Forms use TanStack Form; the shadcn CLI is locked at 4.11.0.

**Shadcn UI Kit facts** [Verified-doc, <https://shadcnuikit.com/pricing>, <https://shadcnuikit.com/blocks>, <https://shadcnuikit.com/components>, <https://shadcnuikit.com/llms.txt>, accessed 2026-09-25]:

- Published by Bundui, "not affiliated with the official shadcn/ui project". One-time sale prices as published on 2026-09-25: Starter $0, Pro $79 (1 user), Team $199 (10 users), Enterprise $499 (unlimited).
- **Public-repo restriction.** The pricing FAQ: "You cannot use the premium components or templates in an open-source project where the source code is publicly available … You may only use them in closed-source projects."
- **No formal licence for free items.** `/license` returns 404 and `/terms-conditions` has no licence grant. Free items are "free to copy and use in personal and commercial projects" but carry no open-source licence, and the free GitHub repo has no LICENSE file. Committing them to a public MIT repo is legally unclear: low risk, not formally licensed (VX-13).
- **All 59 ecommerce blocks are Pro** (checkout, product list, category, cards, details, cart, reviews, quickview, promo, store navigation, product features). The only free dashboard blocks are Sign In Form 1, Stat Card 1, Table 1 and Modal Dialog 16; 527 of 532 component variants are free.
- **Registry quirks.** `@shadcnuikit` → `https://shadcnuikit.com/r/{name}.json`; Pro items need `Authorization: Bearer ${SHADCNUIKIT_API_KEY}`. Items declare no `dependencies` or `registryDependencies` and hard-code the target `components/<name>.tsx` at the repo root. The official directory marks the registry "degraded" (<https://ui.shadcn.com/r/registries.json>).
- **Next.js coupling.** The admin dashboard templates are Next.js 16 App Router apps (next/link, next/navigation, next/font, next-themes, server components, `proxy.ts`), and Page Builder exports Next.js only. 22 of 556 public registry items import `next/image` or `next/link`. Block forms use React Hook Form + Zod or Formisch + Valibot.
- The licence bars "tools that allow others to build sites using Shadcn UI Kit components directly". There is no WCAG conformance statement.

**shadcn/ui facts** [Verified-doc, accessed 2026-09-25]: there is no `upgrade` command; `shadcn add <c> --diff` compares a copied component with upstream (<https://ui.shadcn.com/docs/cli>). `style` cannot change after init (<https://ui.shadcn.com/docs/components-json>). Base UI is the default for new projects since 2026-07-02, but Radix "is not being deprecated".

**CommerCN**: README says MIT but there is no LICENSE file; its 17 blocks have no `aria-label` or `sr-only` text ([00 §9](../00-context-assumptions-and-questions.md#9-research-log)).

## Decision

1. **Remove `@commercn`** from `components.json` in M0 (RF-39).
2. **Primitives: shadcn/ui core, style `radix-nova`**, copied into `inertia/components/ui` and owned by the repo, with minimal local edits. A quarterly chore runs `shadcn add <component> --diff` with the pinned CLI and merges changes by hand. `~/lib/utils` stays the only `cn` import path [Assumption].
3. **Storefront commerce blocks are DripNepal-owned** components in `inertia/components/<domain>/`, composed from shadcn primitives, starting from `inertia/components/commerce`: product card, gallery, variant picker, cart grouped by shop, checkout steps, filters, order timeline, seller order table. Premium kit blocks are **visual reference only**: never copied, downloaded or pasted.
4. **Free kit items are gated on VX-13.** Nothing from `@shadcnuikit`, not even a free item, is committed until Bundui (contact@shadcnuikit.com) confirms in writing that free items may be redistributed in a public MIT repo; the reply is stored with the risk register. Once cleared, each item is previewed with `--dry-run`, moved from repo-root `components/` into `inertia/components/kit/` with a provenance header (source URL, date, licence reference), given its missing primitives and npm dependencies by hand, has `next/*` imports replaced with Inertia `Link` and the project image component, is rewired to TanStack Form, and gets an accessibility review.
5. **Premium kit code is never committed while the repository is public.** Going private and buying Pro or Team (OD-22 option b) needs a superseding ADR covering seats, `SHADCNUIKIT_API_KEY` in env only, and whether a private package counts as "closed-source" (unverified).
6. **Kit dashboards and Page Builder output are reference only**, never ported wholesale. No vendor page-builder feature is built from kit blocks, because of the builder-tools restriction.
7. **Registry hygiene.** Every third-party `shadcn add` is previewed with `--dry-run`; `components.json` diffs get explicit review; tokens appear only as `${VAR}`.
8. **Accessibility baseline** WCAG 2.2 AA ([08](../08-ui-ux-and-design-system.md)): primary checkout actions at least 44 px high and no target below the 24×24 px of SC 2.5.8 [Verified-doc, <https://www.w3.org/TR/WCAG22/>, accessed 2026-09-25].

## Alternatives considered

| Alternative                                                             | Why rejected                                                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Keep `@commercn`                                                        | Rejected by Q7. README-only licence claim, missing accessible names, undeclared dependencies.                          |
| Buy Pro or Team and commit premium code to the public repo              | Barred by the vendor's FAQ.                                                                                            |
| Go private and buy Pro ($79) or Team ($199), as published on 2026-09-25 | Valid, but the product owner's call (OD-22) and contrary to Q7. The blocks would still need porting and form rewiring. |
| Premium code in a private package consumed by the public repo           | Unverified whether that is "closed-source" (VX-13), and the built client bundle ships the code publicly anyway.        |
| Another kit (MUI, Chakra)                                               | A second design system and larger bundles on slow networks (NFR-PERF-002).                                             |
| Switch to Base UI                                                       | `style` cannot change after init; Radix is supported, and a migration buys nothing for R1.                             |

## Consequences

**Positive**

- The public repository stays licence-clean: every UI file is our own, shadcn/ui (MIT), or cleared in writing.
- Commerce components fit DripNepal's flows (multi-shop cart, COD, per-shop status) rather than single-store demos.
- One form stack (TanStack Form) and one component style across all surfaces.

**Negative**

- More in-house UI work: the free tier gives the storefront almost nothing and dashboards four blocks.
- Provenance headers and manual dependency installs add friction for cleared kit items.

**Risks**

- _A developer copies Pro code from a demo "for reference"_ (R-15). Mitigation: the CI checks below and a PR checklist item.
- _A negative VX-13 answer_ removes only four free blocks and free variants, which shadcn core covers.

## When to revisit

- OD-22 chooses "private + paid tier", or the OD-23 ruling (keep MIT, decided 2026-09-30) is reversed: write a superseding ADR.
- VX-13 is answered: record the reply or refusal here.
- Dashboard work exceeds 10 developer-days that premium blocks would have covered [Assumption]: re-open OD-22 with that data.
- shadcn deprecates Radix, or the OD-25 Inertia upgrade changes `Link`/`Head` usage.

## Verification

- **CI checks** ([10](../10-testing-and-quality-gates.md)): `components.json` has no `@commercn`; any `@shadcnuikit` header uses `${SHADCNUIKIT_API_KEY}`, never a literal; no repo-root `components/` directory; ESLint `no-restricted-imports` bans `next/*` under `inertia/`; every file in `inertia/components/kit/` has a provenance header; the directory is empty until the VX-13 reply is linked from the register.
- **Licence audit**: the npm dependency licence report runs in CI and fails on a non-permissive licence.
- **T-A11Y-001**: axe checks on core storefront, seller and admin pages. **T-UI area (proposed)**: icon buttons have accessible names; storefront targets are at least 24 px.

## Related

- [Risks and open decisions: VX-13, OD-22, OD-23, R-15](../risks-and-open-decisions.md#3-external-verification-register-vx-01--vx-15)
- [UI/UX and design system](../08-ui-ux-and-design-system.md), [Code structure](../09-code-structure-and-engineering-standards.md)
- [03 §6.3 dashboards assessment](../03-system-architecture.md#63-dashboards-assessment-seller-and-admin)
- [ADR-0003](0003-inertia-ssr-storefront-csr-dashboards.md) (Inertia surfaces)

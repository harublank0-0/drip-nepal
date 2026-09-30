# Research Digests

Status: Dated snapshot (compiled 2026-09-25)

These files hold the research behind the planning documents: facts about the stack, hosting, Nepali payments and law, and the UI kit, plus an audit of the exploratory code. Each fact was taken from a primary source where one exists (official documentation, package source code, the text of a law) and most were re-checked by a second reviewer. The planning documents cite them as "the research digests", by digest name (for example `infra_ops`), or with a `[Verified-doc ...]` tag. They are working evidence, not requirements: the numbered documents in [docs/](../) own every decision.

| File                                                     | Digest name               | Covers                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [repository-audit.md](repository-audit.md)               | `audit`                   | Audit of the exploratory code at commit `0282605` in four areas (identity and authorization, schema integrity, frontend, tooling and operations); consolidated as RF-01 to RF-47 in [00 §4.6](../00-context-assumptions-and-questions.md) |
| [adonis-stack.md](adonis-stack.md)                       | `adonis_stack`            | AdonisJS 7 and its packages at the versions in `pnpm-lock.yaml`: Lucid transactions and schema generation, auth, session, shield, limiter, VineJS, Inertia and Tuyau                                                                      |
| [infra-ops.md](infra-ops.md)                             | `infra_ops`               | Hosting regions and providers near Nepal, managed PostgreSQL, object storage, backups, pg-boss and other operations facts                                                                                                                 |
| [nepal-payments.md](nepal-payments.md)                   | `nepal_payments`          | eSewa, Khalti, Fonepay and connectIPS integration details, signatures, status checks and cash on delivery                                                                                                                                 |
| [nepal-regulatory-locale.md](nepal-regulatory-locale.md) | `nepal_regulatory_locale` | The Electronic Commerce Act 2081, consumer protection, privacy, VAT and PAN rules, and locale facts such as dates and number formats                                                                                                      |
| [shadcn-ui-kit.md](shadcn-ui-kit.md)                     | `shadcnuikit`             | Shadcn UI Kit (shadcnuikit.com): publisher, pricing and the licence terms that rule out premium code in a public repository                                                                                                               |
| [ui-frontend.md](ui-frontend.md)                         | `ui_frontend`             | shadcn/ui (radix-nova style), Tailwind CSS 4, Inertia SSR and deferred props, WCAG 2.2 targets, fonts and Devanagari text                                                                                                                 |

## Status tags

Research facts start with a tag:

- `[verified-official]`: read in a primary source (official documentation, package source, the law's text).
- `[verified-secondary]`: supported by a reliable secondary source only.
- `[partially-verified]`: part of the claim is supported; the entry says which part.
- `[unverified]`: not confirmed; treat it as a lead.
- `[contradicted]`: a fact-check found the original claim wrong; the entry records the correction.

A "Fact-check" line under a fact gives the second reviewer's verdict. In the repository audit, the tag after each finding is its severity as corrected by the verifier (`confirmed` or `corrected`), and `MISSED-...` findings are ones the verifier found that the area auditors missed.

## Using these files

- Every fact is dated 2026-09-25. Laws, prices, gateway APIs and package versions change: re-check the source before relying on a fact in code, legal text or a purchase.
- Repository paths (for example `start/routes/shops.ts`) refer to the code at commit `0282605`, before the schema re-baseline ([ADR-0011](../adr/0011-schema-rebaseline-before-production.md)).
- These files are not kept up to date. When a fact changes, update the document that owns the decision and cite the new source there.

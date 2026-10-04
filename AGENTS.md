# AGENTS.md

Guidance for coding agents and contributors working in this repository. It summarises the rules; the documents in [docs/](docs/README.md) own them. When this file and a document differ, the document wins: fix this file.

## The project in brief

DripNepal is a multi-vendor fashion marketplace for Nepal (cash on delivery first, English UI, vendors ship their own parcels in R1), built by a team of one or two developers. The [documentation](docs/README.md) describes the target system. The code is an exploratory prototype with known defects (RF-01 to RF-47 in [docs/00 §4.6](docs/00-context-assumptions-and-questions.md#46-consolidated-repository-findings-rf-01--rf-47)); milestone M0 hardens it before feature work ([docs/12 §4](docs/12-roadmap-and-backlog.md#4-m0-foundation-hardening-r0-ready-to-start)). Treat existing code as evidence of what exists, not as the pattern to follow: [docs/09](docs/09-code-structure-and-engineering-standards.md) says, file by file, what is kept, fixed, rewritten or deleted.

## Before you write code

1. **Find the owner of what you are changing.** Use the [dripnepal-docs skill](.agents/skills/dripnepal-docs/SKILL.md) or the table in [docs/README.md §3](docs/README.md#3-where-to-find). Read the owning section, not a summary of it elsewhere.
2. **Trace the feature**: requirement (FR in [01](docs/01-product-requirements.md)) → journey and acceptance criteria ([02](docs/02-user-journeys-and-acceptance-criteria.md)) → states and money or stock effects ([05](docs/05-order-payment-and-inventory-lifecycles.md)) → tables ([04a](docs/04a-data-dictionary-tables.md)) → operations ([06 §13](docs/06-api-design.md#13-endpoint-catalogue), [openapi.yaml](docs/openapi.yaml)) → permissions and status gates ([07 §4](docs/07-security-threat-model-and-permissions.md)) → tests ([10 §6](docs/10-testing-and-quality-gates.md#6-test-id-registry)) → milestone ([12](docs/12-roadmap-and-backlog.md)).
3. **Build only what the current milestone schedules.** Do not pull later scope forward.
4. **Respect the labels** ([docs/00 §1.2](docs/00-context-assumptions-and-questions.md#12-evidence-labels)): an [Assumption] value is built to and kept configurable; an [Open OD-xx] value is never hard-coded (check [risks §5](docs/risks-and-open-decisions.md#5-decisions-that-block-implementation-by-milestone) for what blocks the milestone); a [Verify-external] fact is not shown to users as fact. A name marked "(proposed)" is not approved yet: implement it only where the milestone schedules it, and keep the docs in step.

## Rules the code must follow

Each rule names its owner; read it there before relying on the summary.

- **Modules.** Business code lives in `app/modules/<module>/`, one folder per module of [03 §4.4](docs/03-system-architecture.md#44-module-responsibilities). A module imports only what [09 §2.2](docs/09-code-structure-and-engineering-standards.md#22-allowed-dependencies) allows; `T-ARCH-001` enforces it. Adonis folders (`app/controllers`, `app/validators`, `app/policies`, `app/transformers`) are organised by surface and module underneath ([09 §1](docs/09-code-structure-and-engineering-standards.md#1-repository-structure)).
- **Layers.** What a controller, action, query, policy and transformer may do is in [09 §3](docs/09-code-structure-and-engineering-standards.md#3-layer-responsibilities); §3.13 is the list a reviewer rejects.
- **Reads and writes.** Pages read through Inertia props; every write goes through the JSON API under `/api/v1` ([ADR-0004](docs/adr/0004-inertia-reads-json-api-writes.md)). JSON is snake_case.
- **API contract.** Errors are problem details with a `code` from [06 §5.2](docs/06-api-design.md#52-codes) ([ADR-0018](docs/adr/0018-error-contract-problem-details.md)). Operations marked ⚷ require an `Idempotency-Key` ([06 §7](docs/06-api-design.md#7-idempotency)); operations marked ⟳ require `If-Match` with the strong ETag `"<version>"` ([06 §8](docs/06-api-design.md#8-concurrent-edits-etag-and-if-match)). Change [06](docs/06-api-design.md) and [openapi.yaml](docs/openapi.yaml) in the same pull request.
- **Tenancy and permissions.** Every shop-scoped read and write is scoped to the caller's shop, and an out-of-scope ID answers 404 exactly like a missing one (`T-SEC-001`). Permissions, status gates and step-up rules come from [07 §3–§4](docs/07-security-threat-model-and-permissions.md); never invent a permission slug.
- **Money.** Amounts are integers in paisa (minor units), never floats or decimals in code ([ADR-0007](docs/adr/0007-money-integer-minor-units.md), [04 §18](docs/04-domain-model-and-data-dictionary.md)). Refund line amounts, totals, prices, `shop_id` and commission are computed by the server; client-sent values are rejected (`T-SEC-003`).
- **Stock and orders.** Reservations, the `placeOrder` algorithm, lock ordering and every state transition are in [05](docs/05-order-payment-and-inventory-lifecycles.md). Transitions are compare-and-set updates; never update a status without the `WHERE status = :from` guard.
- **Jobs.** Jobs run on pg-boss and are sent inside the same transaction as the change that causes them; handlers are idempotent ([ADR-0010](docs/adr/0010-postgres-jobs-pg-boss-transactional-send.md), [03 §9–§10](docs/03-system-architecture.md#9-asynchronous-work)).
- **Data model and migrations.** Tables, columns and constraints are exactly those of [04a](docs/04a-data-dictionary-tables.md); conventions in [04 §2](docs/04-domain-model-and-data-dictionary.md). The schema is re-baselined in M0; after that an applied migration is never edited ([ADR-0011](docs/adr/0011-schema-rebaseline-before-production.md), [09 §8](docs/09-code-structure-and-engineering-standards.md#8-migrations-and-seeders)).
- **Personal data and logs.** Classification, encryption, masking and retention rules are in [07 §5](docs/07-security-threat-model-and-permissions.md) and [04 §19](docs/04-domain-model-and-data-dictionary.md); no third-party analytics. Never log secrets, tokens or personal values ([09 §7](docs/09-code-structure-and-engineering-standards.md#7-structured-logging)).
- **Frontend.** Pages, components, tokens and the accessibility target are in [08](docs/08-ui-ux-and-design-system.md); frontend code rules in [09 §13](docs/09-code-structure-and-engineering-standards.md#13-frontend-code-standards). shadcn/ui is the component base ([ADR-0015](docs/adr/0015-ui-foundation-shadcn-and-kit-policy.md)); the UI skills in `.agents/skills/` help with design work but never override 08.
- **Files and names.** snake_case file names on the server and in `inertia/` (shadcn copies in `inertia/components/ui/` keep their names). Generated files are never edited by hand ([09 §1.4](docs/09-code-structure-and-engineering-standards.md#14-generated-artefacts)).
- **Tests.** Every behaviour you add cites a test ID from [10 §6](docs/10-testing-and-quality-gates.md#6-test-id-registry); a new test gets its ID registered there first. Concurrency, triggers and grants are tested on real PostgreSQL ([10 §3](docs/10-testing-and-quality-gates.md#3-test-layers-and-tooling)).

## When the code and the documents disagree

The documents describe the target. If the code differs, the code is wrong unless the document is. If the document is wrong or incomplete, fix the owning document in the same pull request, then the documents that restate it, and record the change in its Consistency notes ([docs/README.md §4](docs/README.md#4-changing-a-document)). An Accepted ADR is changed only by a dated "Edited YYYY-MM-DD" note before the first production release, and by a superseding ADR after it. A new open decision goes to the [risks register](docs/risks-and-open-decisions.md), a new assumption to [00 §6](docs/00-context-assumptions-and-questions.md#6-proposed-defaults-and-assumptions-register).

## Keep the repository self-contained

Nothing in the repository may point to files outside it: no absolute paths, no references to local notes or other machines. Link documents with relative paths and check the anchors. `T-ARCH-030` blocks such references in CI from M0.

## Writing documentation

Short, plain sentences. Put identifiers in backticks (Prettier can turn an unquoted `snake_case` name into emphasis). Name the mechanism and the test instead of words like "secure" or "robust". Use the evidence labels and keep the "(proposed)" and test-ID marks ([reviews/consistency-review.md §4](docs/reviews/consistency-review.md#4-conventions-the-documents-now-share)).

## Commands

| Command                                      | Use                                                           |
| -------------------------------------------- | ------------------------------------------------------------- |
| `pnpm install`                               | Install dependencies (pnpm 11 is enforced)                    |
| `docker compose up -d`                       | Local PostgreSQL 18 (and Mailpit)                             |
| `node ace migration:run`, `node ace db:seed` | Database schema and seed data                                 |
| `pnpm dev`                                   | Development server with hot reload on `http://localhost:3333` |
| `pnpm test`                                  | Japa test suites                                              |
| `pnpm lint`, `pnpm typecheck`, `pnpm format` | ESLint, TypeScript for server and `inertia/`, Prettier        |

The target local setup, including the pg-boss schema step and the `jobs:work` worker, is [docs/11 §4.4](docs/11-deployment-and-operations.md#44-local-setup-in-five-commands); M0 brings the repository to it.

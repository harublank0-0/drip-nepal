![AdonisJS 7](https://img.shields.io/badge/AdonisJS_7-5A45FF?style=for-the-badge&logo=adonisjs&logoColor=white) ![React 19](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) ![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) ![PostgreSQL 18](https://img.shields.io/badge/PostgreSQL_18-4169E1?style=for-the-badge&logo=postgresql&logoColor=white) ![Inertia.js](https://img.shields.io/badge/Inertia.js-9552EA?style=for-the-badge&logo=inertia&logoColor=white)

![Node >=24](https://img.shields.io/badge/Node-%3E%3D24-339933?style=for-the-badge&logo=node.js&logoColor=white) ![pnpm 11](https://img.shields.io/badge/pnpm_11-F69220?style=for-the-badge&logo=pnpm&logoColor=white) ![All rights reserved](https://img.shields.io/badge/license-all_rights_reserved-red.svg?style=for-the-badge)

# Drip Nepal 🇳🇵

**A multi-vendor fashion marketplace for Nepal.**

Customers browse clothing, shoes and accessories from many local shops and buy from several of them in one checkout, paying cash on delivery. Vendors apply to open a shop, list products with sizes, colours and stock, and accept, ship and track their orders from a seller dashboard. Platform staff review shops and products, handle support and refunds, and settle what vendors owe or are owed through a ledger. It is built and run by a team of one or two developers.

## Project status

**Milestone M0 is under way. There is no working storefront.**

- The [documentation](docs/README.md) describes the target system: requirements, journeys, architecture, data model, lifecycles, API, security, UI, code standards, tests, operations and the roadmap. It is the source of truth.
- **M0 Foundation hardening** ([docs/12 §4](docs/12-roadmap-and-backlog.md#4-m0-foundation-hardening-r0-ready-to-start)) is in progress: a CI gate, the test harness, the error contract, session revocation, a re-baselined schema and a safe production bootstrap, before any feature work. The re-baselined schema (epic E4) is built: 14 migrations, the models, the reference seeders and the schema tests ([database/README.md](database/README.md)).
- The single-seller v1 store that the exploratory prototype grew into was removed with the baseline. It was never hosted and held only seed data. The storefront, seller dashboard and admin pages come back as M1 to M7 rebuild them; until then the app serves only a development design-system page and its health endpoints. Nothing is deployed ([DEPLOY.md](DEPLOY.md)).
- The prototype's known defects are listed as RF-01 to RF-47 in [docs/00 §4.6](docs/00-context-assumptions-and-questions.md#46-consolidated-repository-findings-rf-01--rf-47); M0 closes or guards them.

## Roadmap

| Milestone | Name                                     | Release   | Goal                                                                                          |
| --------- | ---------------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| M0        | Foundation hardening                     | R0        | Every high repository finding closed or guarded; CI gate; schema re-baseline; safe bootstrap  |
| M1        | Identity & accounts                      | R1        | Sign-up, verification, login, recovery, addresses; staff TOTP; user suspension                |
| M2        | Shop onboarding & membership             | R1        | Users apply, admins review, approved shops set up profile, delivery, staff and payout account |
| M3        | Catalog authoring & media                | R1        | Products with variants, images, disclosures and stock; moderation                             |
| M4        | Storefront discovery                     | R1        | Server-rendered listings, search, product and shop pages within budgets                       |
| M5        | Cart & COD checkout                      | R1        | Server cart and one idempotent multi-shop COD order without oversell                          |
| M6        | Order processing & fulfillment           | R1        | Accept, ship, deliver, collect, return to origin; tracking; support cases and returns         |
| M7        | Ledger, admin ops & launch readiness     | R1 (gate) | Ledger, remittances, refunds, admin operations; the R1 launch gate                            |
| M8        | Gateway payments                         | R1.1      | One wallet gateway, gateway refunds, reconciliation, vendor payouts                           |
| M9        | Returns, reviews, wishlist, coupons, SMS | R2        | Self-serve returns, reviews, wishlist, platform coupons, SMS and phone OTP                    |

R1 is cash on delivery only, in English, with vendors shipping their own parcels or booking Nepal Can Move through a courier account ([ADR-0019](docs/adr/0019-courier-integration-in-r1.md)). Scope, exit criteria and the decisions each milestone needs are in [docs/12](docs/12-roadmap-and-backlog.md) and [docs/01 §5](docs/01-product-requirements.md#51-release-phases).

## Architecture (target)

A modular monolith on AdonisJS 7 ([ADR-0002](docs/adr/0002-modular-monolith-adonisjs.md)), in two processes built from one image:

- **`web`**: the HTTP server. Inertia React pages, server-rendered for the storefront and rendered in the browser for the seller and admin dashboards ([ADR-0003](docs/adr/0003-inertia-ssr-storefront-csr-dashboards.md)). Pages read through Inertia props and write through the JSON API under `/api/v1` ([ADR-0004](docs/adr/0004-inertia-reads-json-api-writes.md)).
- **`worker`**: background jobs on pg-boss, in the same PostgreSQL database, sent in the same transaction as the change that causes them ([ADR-0010](docs/adr/0010-postgres-jobs-pg-boss-transactional-send.md)).

PostgreSQL 18 holds all durable state, including sessions, jobs and the listing read model used for search ([ADR-0014](docs/adr/0014-postgres-search-and-listing-read-model.md)). Images and KYC files live in S3-compatible object storage. Money is stored as integer paisa ([ADR-0007](docs/adr/0007-money-integer-minor-units.md)). Hosting is a single region near Nepal behind Cloudflare, kept portable ([ADR-0016](docs/adr/0016-hosting-single-region-portable.md), still Proposed). See [docs/03](docs/03-system-architecture.md) for the full architecture and the [ADR index](docs/adr/README.md) for every decision.

| Area     | Technology                                                                           |
| -------- | ------------------------------------------------------------------------------------ |
| Frontend | React 19, Inertia, TypeScript, Tailwind CSS v4, shadcn/ui on Radix, lucide icons     |
| Backend  | AdonisJS 7, Lucid ORM, VineJS validation, session authentication, Tuyau typed routes |
| Data     | PostgreSQL 18; pg-boss for jobs; S3-compatible object storage                        |
| Tests    | Japa (unit, functional, browser suites)                                              |
| Tooling  | Node 24, pnpm 11, Vite, ESLint, Prettier, Husky                                      |

Exact versions are in [docs/00 §4.2](docs/00-context-assumptions-and-questions.md#42-stack-and-exact-versions).

## Documentation

Start at [docs/README.md](docs/README.md): it lists every document, what it owns and a reading order for each role. Coding agents and contributors should also read [AGENTS.md](AGENTS.md).

## Running it locally

The steps below run what exists today. M0 brings them to the target setup of [docs/11 §4.4](docs/11-deployment-and-operations.md#44-local-setup-in-five-commands).

Prerequisites: Node.js 24 or later, pnpm 11 (enforced by `packageManager`), Docker.

```bash
git clone https://github.com/harublank0-0/drip-nepal.git
cd drip-nepal
pnpm install

cp .env.example .env     # the database settings already match docker-compose.yml
node ace generate:key --show   # paste the key after APP_KEY= in .env
# An older .env lacks newer variables: boot lists every missing one; copy them from .env.example.

docker compose up -d     # PostgreSQL 18 (dripnepal_dev, dripnepal_test and the three database roles), Mailpit and SeaweedFS (S3 storage for photos), on 127.0.0.1 only; Redis only with --profile redis
# A volume made before 2026-11-20 holds `dripnepal`, not `dripnepal_dev`: recreate it once with `docker compose down -v` (deletes local data).
node ace migration:run --no-schema-generate   # the 14 baseline files; leaves the generated database/schema.ts alone
node ace jobs:install    # the pg-boss schema, its queues and its grants (docs/11 §6.1)
node ace db:seed         # reference data only: no demo shops, products, orders or logins in M0 (OD-59)
pnpm dev                 # http://localhost:3333/dev/design-system and /health/live
```

No seeder creates a login, in any environment. The first platform admin comes from `node ace platform:create-admin --interactive`, which asks for the e-mail and the name, then the password at a masked prompt (only the password is masked); it has no password flag and needs a terminal ([docs/09 §9.1](docs/09-code-structure-and-engineering-standards.md#91-node-ace-platformcreate-admin)). Nothing can sign in until M1 builds the login and TOTP enrolment. The enrolment link the command queues is valid for 24 hours and waits for M1's worker, so it will have expired by then: an admin created in M0 enrols through `platform:create-admin --recover`, which comes with M1. Production and staging follow [docs/11](docs/11-deployment-and-operations.md) instead of this section: the release step runs the migrations, `jobs:install`, the reference seeders and `node ace release:check`.

Every other path answers 404 until M1 to M7 add the pages. The `dripnepal-run` and `dripnepal-testing` skills in `.agents/skills/` have the details, including a setup without Docker.

| Script           | What it does                                    |
| ---------------- | ----------------------------------------------- |
| `pnpm dev`       | Development server with hot module replacement  |
| `pnpm build`     | Production build                                |
| `pnpm start`     | Start the production build                      |
| `pnpm test`      | Japa test suites                                |
| `pnpm lint`      | ESLint                                          |
| `pnpm typecheck` | TypeScript checks for the server and `inertia/` |
| `pnpm format`    | Prettier                                        |

## Contributing

1. Read [AGENTS.md](AGENTS.md) and the documents that own what you are changing ([docs/README.md §3](docs/README.md#3-where-to-find)).
2. Build what the current milestone of [docs/12](docs/12-roadmap-and-backlog.md) schedules, to the rules of [docs/09](docs/09-code-structure-and-engineering-standards.md).
3. When the code needs a rule to change, change the owning document in the same pull request ([docs/README.md §4](docs/README.md#4-changing-a-document)).
4. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before opening a pull request. From M0, CI blocks on the gates of [docs/10 §5](docs/10-testing-and-quality-gates.md#5-ci-quality-gates).

## License

All rights reserved. The source is public so that it can be read, not reused. See [LICENSE](LICENSE).

## Author

**Haru Blank**. Built for Nepal's local businesses.

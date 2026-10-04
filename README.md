![AdonisJS 7](https://img.shields.io/badge/AdonisJS_7-5A45FF?style=for-the-badge&logo=adonisjs&logoColor=white) ![React 19](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) ![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) ![PostgreSQL 18](https://img.shields.io/badge/PostgreSQL_18-4169E1?style=for-the-badge&logo=postgresql&logoColor=white) ![Inertia.js](https://img.shields.io/badge/Inertia.js-9552EA?style=for-the-badge&logo=inertia&logoColor=white)

![Node >=24](https://img.shields.io/badge/Node-%3E%3D24-339933?style=for-the-badge&logo=node.js&logoColor=white) ![pnpm 11](https://img.shields.io/badge/pnpm_11-F69220?style=for-the-badge&logo=pnpm&logoColor=white) ![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)

# Drip Nepal 🇳🇵

**A multi-vendor fashion marketplace for Nepal.**

Customers browse clothing, shoes and accessories from many local shops and buy from several of them in one checkout, paying cash on delivery. Vendors apply to open a shop, list products with sizes, colours and stock, and accept, ship and track their orders from a seller dashboard. Platform staff review shops and products, handle support and refunds, and settle what vendors owe or are owed through a ledger. It is built and run by a team of one or two developers.

## Project status

**Planning is complete; building starts with milestone M0.**

- The [documentation](docs/README.md) describes the target system: requirements, journeys, architecture, data model, lifecycles, API, security, UI, code standards, tests, operations and the roadmap. It is the source of truth.
- The code in this repository is an **exploratory prototype**. Its known defects are listed as RF-01 to RF-47 in [docs/00 §4.6](docs/00-context-assumptions-and-questions.md#46-consolidated-repository-findings-rf-01--rf-47). It is not ready for real orders.
- **Next: M0 Foundation hardening** ([docs/12 §4](docs/12-roadmap-and-backlog.md#4-m0-foundation-hardening-r0-ready-to-start)): a CI gate, the test harness, the error contract, session revocation, a re-baselined schema and a safe production bootstrap, before any feature work.

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

R1 is cash on delivery only, in English, with vendors shipping their own parcels. Scope, exit criteria and the decisions each milestone needs are in [docs/12](docs/12-roadmap-and-backlog.md) and [docs/01 §5](docs/01-product-requirements.md#51-release-phases).

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

## Running the prototype

The steps below run the current prototype. M0 replaces them with the target setup of [docs/11 §4.4](docs/11-deployment-and-operations.md#44-local-setup-in-five-commands).

Prerequisites: Node.js 24 or later, pnpm 11 (enforced by `packageManager`), Docker.

```bash
git clone https://github.com/harublank0-0/drip-nepal.git
cd drip-nepal
pnpm install

cp .env.example .env
node ace generate:key
# add the database settings to .env, matching docker-compose.yml:
# DB_HOST=localhost DB_PORT=5432 DB_USER=dripnepal DB_PASSWORD=secret DB_DATABASE=dripnepal

docker compose up -d     # PostgreSQL 18, Redis and Mailpit (the app uses only PostgreSQL)
node ace migration:run
node ace db:seed
pnpm dev                 # http://localhost:3333
```

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

MIT. See [LICENSE](LICENSE).

## Author

**Haru Blank**. Built for Nepal's local businesses.

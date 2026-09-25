# ADR-0002: Modular monolith on AdonisJS 7 + Lucid + PostgreSQL

Status: Draft v1 (2026-09-25)

Reviewed: critic pass A4.3 (2026-09-25)

## Status

| Field           | Value                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| Decision status | **Accepted**                                                                |
| Date            | 2026-09-25                                                                  |
| Deciders        | Product owner, lead developer                                               |
| Supersedes      | —                                                                           |
| Superseded by   | —                                                                           |
| Blocking items  | none. Job backend is ADR-0010; hosting is ADR-0016 (Proposed, VX-09/OD-09). |

## Context

**Team and scale.** 1–2 developers, a small budget, fewer than about 50 shops and about 1–2k orders per month at launch [Confirmed, Q1].

**Existing stack** [Verified-repo, `pnpm-lock.yaml`]: @adonisjs/core 7.3.4, @adonisjs/lucid 22.4.2, @adonisjs/auth 10.1.0, @adonisjs/session 8.1.0, @adonisjs/shield 9.0.0, @adonisjs/inertia 4.2.0, React 19.2.7, Vite 7, TypeScript 6.0.3, Node 24. docker-compose runs Postgres 18.4, Redis 8.6 and Mailpit. There are no tests and no CI (RF-09).

**The domain is transactional across areas.** `placeOrder` must, in one transaction, lock the cart, reserve stock, insert `orders`, `shop_orders` and `order_items` with snapshots, create payment records, write the idempotency key, events and audit rows, and send follow-up jobs ([05 §4](../05-order-payment-and-inventory-lifecycles.md#4-checkout-the-placeorder-algorithm)). Gateway capture likewise changes payment, allocations, reservations and shop orders together ([05 §6.4](../05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11)). Lucid managed transactions (`db.transaction(cb)`) commit on resolve and roll back on throw, and the query builder offers `forUpdate()` and `skipLocked()` [Verified-doc, https://lucid.adonisjs.com/docs/transactions, accessed 2026-09-25]. Services would turn each of these into a distributed saga that two people must operate.

**The current code has no boundaries.** The client sets price and order number (RF-16), and order items can reference another shop's product (RF-13).

**Framework conventions.** Adonis generators and the `indexEntities` hook index `app/controllers/**` and transformers; a layout that fights them loses generated `Data.*` types and the Tuyau route registry [Verified-doc, @adonisjs/core 7.3.4 `index_entities.d.ts`].

**Connections are scarce.** DigitalOcean Managed PostgreSQL's 1 GiB plan allows 22 backend connections [Verified-doc, https://docs.digitalocean.com/products/databases/postgresql/details/limits/, accessed 2026-09-25]; the budget is split in [03 §3.4](../03-system-architecture.md#34-postgresql-layout-and-connection-budget). Every extra process spends from it.

## Decision

Keep AdonisJS 7 + Lucid + PostgreSQL 18 and structure the application as a **modular monolith**. The module map, dependency diagram and enforcement config are owned by [03 §4](../03-system-architecture.md#4-modules-and-dependency-rules); the folder layout by [09](../09-code-structure-and-engineering-standards.md).

1. **One codebase, one Docker image, two process types.** `web` serves HTTP and renders Inertia SSR in-process; `worker` runs pg-boss consumers and cron (ADR-0010). PostgreSQL is the only required stateful service; Redis stays optional in docker-compose.
2. **Fifteen modules, each a folder that owns its tables:** `identity`, `shops`, `catalog`, `media`, `inventory`, `pricing`, `logistics`, `cart`, `checkout`, `orders`, `payments`, `ledger`, `notifications`, `audit`, `platform`. Examples: only `inventory` writes `inventory_*`; only `ledger` writes `ledger_entries`; `checkout` owns no tables and orchestrates.
3. **Dependency rule.**
   - Reads of another module go through its exported `app/modules/<m>/queries.ts`; writes go through its `app/modules/<m>/actions/*`, called with the caller's transaction.
   - Dependencies point one way, with no cycles: platform/audit ← identity ← shops ← catalog/media ← inventory ← pricing ← cart ← checkout → orders → payments → ledger. `logistics` sits in the foundation beside `platform` and `audit`, because `identity` and `pricing` need it ([03 §4.1](../03-system-architecture.md#41-dependency-diagram)).
   - Upward calls are forbidden, even inside a transaction. When a lower and a higher module must change together, the higher one orchestrates downward: `orders.applyPaymentOutcome(trx, …)` calls `payments.applyProviderResult` and `inventory.commitHeld` in one transaction. There is no upward payments → orders event.
   - Other side effects after commit (emails, listing refresh, session revocation) are domain events sent as pg-boss jobs in the same transaction (ADR-0010). Queue names use underscores (`catalog.refresh_listing`). `notifications` only consumes: `notifications.dispatch` writes `notification_deliveries` rows, then `notifications.send_email` sends each one ([03 §9](../03-system-architecture.md#9-asynchronous-work)).
4. **Adonis-conventional directories stay**: `app/controllers/<surface>/<module>/`, `app/models` (relations only, no business logic), `app/validators`, `app/policies`, `app/transformers`. Business code lives in `app/modules/<module>/{actions,queries.ts,domain,events.ts,jobs}`. The generated `database/schema.ts` is never hand-edited.
5. **Controllers are thin**: validate (Vine), authorize (ADR-0006), call one module action or query, transform the result.

## Alternatives considered

| Alternative                                        | Why rejected                                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microservices (catalog, orders, payments)          | `placeOrder` and capture become sagas; more network hops, deployments and monitoring for 1–2 people; several pools compete for 22 connections. Nothing at about 2k orders a month needs separate scaling. |
| Unstructured monolith (controllers call models)    | No place to enforce "only `inventory` writes stock" or "prices come from `pricing`"; RF-16 and RF-13 are the result.                                                                                      |
| Rewrite in NestJS, Laravel or a Next.js full stack | Discards working Adonis 7 code and the first-party packages the plan uses (session auth, Vine, Shield, limiter 3.0.1, Drive 4.0.0, mail 10.4.0, i18n 3.0.1 [Verified-doc, npm registry metadata]).        |
| pnpm workspace package per module                  | Compile-time boundaries, but build and tooling overhead for 15 packages; a CI import rule (T-ARCH-001) catches most violations far more cheaply.                                                          |
| MySQL or MongoDB                                   | The design relies on PostgreSQL CHECKs, partial unique indexes, row locks (ADR-0008), `pg_trgm` and full-text search (ADR-0014), pg-boss (ADR-0010) and `uuidv7()` (ADR-0017).                            |

## Consequences

**Positive**

- Checkout, capture, cancellation and refund invariants hold inside one PostgreSQL transaction, with CHECK constraints as backstops.
- One image and one pipeline; local development is `docker compose up` plus `node ace serve`.
- Ownership is reviewable: a PR that writes `ledger` tables outside `app/modules/ledger` fails T-ARCH-001.

**Negative**

- Scaling is vertical first; an SSR spike and a heavy admin report share `web` processes until another instance is added.
- A bad deploy takes down storefront, seller and admin together.
- Adonis 7 has no maintained OpenAPI generator [Verified-doc, @tuyau/core 1.2.2 exports, https://registry.npmjs.org/@tuyau/core/-/core-1.2.2.tgz, accessed 2026-09-25]; `docs/openapi.yaml` is hand-written and checked by T-API-001 (ADR-0004).

**Risks**

- _Boundary erosion_ ("import the model just once"). Mitigation: T-ARCH-001 on every PR; module-private files are not exported.
- _Adapter version drift_: @adonisjs/inertia 4.2.0 targets Inertia v2 while current Adonis docs target adapter 5 and Inertia v3 (OD-25, R-22). See ADR-0003.

## When to revisit

Extract a module into a service only when one of these holds and adding `web` or `worker` instances has not fixed it:

- One module needs a different scaling profile, for example `web` CPU above 70 % at peak with SSR as the main consumer while reads meet NFR-PERF-003 (p95 ≤ 300 ms), and edge caching (03 §6.4) did not help.
- Search needs an engine PostgreSQL cannot replace (ADR-0014 thresholds).
- More than about 6 developers, with module ownership conflicts slowing delivery.
- A regulatory outcome requires payment or personal data on separate infrastructure (VX-01, VX-09).
- Volume passes about 50k orders a month (25× launch), or pool tuning can no longer meet the connection budget.

## Verification

- **T-ARCH-001** (module dependency rules; dependency-cruiser, config sketch in [03 §4.3](../03-system-architecture.md#43-enforcement-t-arch-001)): fails on imports of another module's internals, on writes to tables the module does not own, and on cycles.
- **Review checklist** ([09](../09-code-structure-and-engineering-standards.md)): one action or query per controller; no logic in models.
- **Transaction tests**: T-CHK-004 and T-INV-003 exercise the single-transaction checkout; T-PAY-005 exercises the single capture transaction.

## Related

- [03 Architecture: containers, modules, jobs](../03-system-architecture.md) · [05 Lifecycles](../05-order-payment-and-inventory-lifecycles.md)
- [04 Domain model](../04-domain-model-and-data-dictionary.md) · [09 Code structure](../09-code-structure-and-engineering-standards.md)
- [ADR-0003](0003-inertia-ssr-storefront-csr-dashboards.md), [ADR-0004](0004-inertia-reads-json-api-writes.md), [ADR-0010](0010-postgres-jobs-pg-boss-transactional-send.md), [ADR-0016](0016-hosting-single-region-portable.md)

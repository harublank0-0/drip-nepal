# ADR-0011: Re-baseline the schema before the first production deploy

Status: Draft v1 (2026-09-25)

Reviewed: 2026-09-25 · consistency review 2026-09-30 to 2026-10-04

## Status

- **Decision status:** **Accepted** on 2026-09-30, when OD-01 was decided: the product owner confirmed that no hosted instance holds real users, shops or orders (Assumption A-01 confirmed).
- **Date:** 2026-09-25
- **Deciders:** product owner (OD-01), lead developer
- **Supersedes / superseded by:** — / — (after the R1 launch the forward-only rule is permanent)
- **Related open items:** VX-10 (location dataset for reference seeders); OD-01 was decided on 2026-09-30 (re-baseline)

## Context

**Repository** [Verified-repo, RF-41]:

- `database/migrations` has 26 files: 25 exploratory tables plus the `pgcrypto` extension ([00 §4.3](../00-context-assumptions-and-questions.md#43-what-exists), [04 §20.1](../04-domain-model-and-data-dictionary.md#201-mapping-from-current-tables-to-the-baseline)).
- Applied migrations have been **edited in place**. For example, commit `9144745` changed `payments.paid_at` inside the create migration.
- Migrations import mutable app constants (`#constants/shop_status`), and one has a hand-picked timestamp (`1780080000000`).

**Structural defects that are more than column tweaks:**

- cascades into orders and payments (RF-06);
- one order row spanning shops (RF-07);
- a globally unique `recipient_phone` (RF-11);
- no composite tenant keys (RF-13);
- a single stock integer (RF-14);
- no payment event or refund model (RF-15);
- `decimal(10,2)` money (RF-16);
- catalog uniqueness and default statuses (RF-17);
- miswired RBAC (RF-20);
- free-text statuses (RF-23);
- unenforced soft delete (RF-24);
- indexes that do not match queries (RF-45).

Fixing these incrementally would take dozens of ALTER migrations that convert or drop data nobody has.

**Framework** [Verified-doc, Lucid 22.4.2, accessed 2026-09-25]:

- `migration:run` regenerates `database/schema.ts` outside production only (`build/commands/migration/run.js`), so the committed file must match the migrations.
- Schema rules load only when `schemaGeneration.rulesPaths` is set.
- `schema:dump --prune` exists, but it would snapshot the defective schema instead of replacing it.

**Timing.** No production data exists: the product owner confirmed it when OD-01 was decided on 2026-09-30 (A-01). Once real orders exist, their records must be kept for the statutory period [Verify-external VX-08; schedule in [04 §19.3](../04-domain-model-and-data-dictionary.md#193-retention-schedule)], and a destructive reset is no longer acceptable. The cheap moment is before launch.

## Decision

1. **In M0, replace the 26 migration files with a reviewed baseline** that implements [04](../04-domain-model-and-data-dictionary.md) and [04a](../04a-data-dictionary-tables.md) exactly.
   - There are 14 files, one per module group, generated with `node ace make:migration`. They follow the order in [04 §20.2.2](../04-domain-model-and-data-dictionary.md#2022-baseline-files-and-their-order), in which every FK points at a table created earlier.
   - File 1 holds the extensions and the `set_updated_at()`, `forbid_mutation()` and `allow_only_columns()` functions. Logistics reference tables come before identity, and platform tables come after identity. Inventory comes after orders. The ledger file creates `payouts` and `vendor_remittances` before `ledger_entries`.
   - Two reference cycles are closed by later `ALTER TABLE`s: `shops` ↔ `media_assets`, and `return_requests_case_fkey`, which is added after `support_cases`.
   - The last commit before the baseline is tagged `pre-baseline`, and the old files are deleted.
2. **The baseline encodes the invariants of the other ADRs:**
   - `citext` and `pg_trgm`;
   - `uuidv7()` defaults (built into PostgreSQL 18 [Verified-doc, <https://www.postgresql.org/docs/18/functions-uuid.html>, accessed 2026-09-25]; availability on the managed cluster is an M0 spike);
   - `text` statuses with CHECK lists;
   - `*_minor bigint` money (ADR-0007);
   - composite tenant FKs (ADR-0006);
   - RESTRICT into orders, payments, the ledger and audit;
   - partial unique indexes;
   - the session and limiter tables (ADR-0005);
   - `REVOKE UPDATE, DELETE` plus triggers on the nine append-only tables of [04 §2.12](../04-domain-model-and-data-dictionary.md#212-append-only-tables).

   pg-boss manages its own `pgboss` schema outside our migrations (ADR-0010).

   Edited 2026-10-01 (tech lead decision): the `pgboss` schema stays outside our migrations, but `dripnepal_migrator` owns it. pg-boss's own schema install or upgrade runs in the release container as the migrator, after `migration:run`, and the release step then re-grants `USAGE` on `pgboss` and DML on its tables to `dripnepal_app` after every install or upgrade. Both pg-boss instances that run as `dripnepal_app`, the worker's and the `web` send-only one of ADR-0010 decision 1, start with pg-boss's migration disabled ([07 §4.10](../07-security-threat-model-and-permissions.md#410-database-roles-and-grants), [11 §6.1](../11-deployment-and-operations.md#61-where-and-how-migrations-run), [03 §3.4](../03-system-architecture.md#34-postgresql-layout-and-connection-budget), [09 §2.3](../09-code-structure-and-engineering-standards.md#23-how-modules-cooperate)). The rest of the decision is unchanged.

3. **Migrations are self-contained.** They never import from `#constants`, `#models` or `#modules`, and they write value lists as literals.
4. **Reference data and dev data are separate** ([04 §20.3](../04-domain-model-and-data-dictionary.md#203-seeders-factories-and-schema-generation)). Reference seeders (locations per VX-10, categories, attributes, zones, settings) are idempotent upserts that run in production. Dev seeders refuse to run when `NODE_ENV=production` (RF-05). The first platform admin comes from `node ace platform:create-admin` (FR-ADM-005).
5. **After the first production deploy: forward-only, expand/contract** ([04 §20.2.4](../04-domain-model-and-data-dictionary.md#2024-after-the-first-production-deploy-forward-only-expand-and-contract)).
   - An applied migration is never edited, and `down` is never run in production.
   - Each migration except a `CREATE INDEX CONCURRENTLY` file sets `lock_timeout = '5s'` first; a concurrent-index file sets none and starts with `DROP INDEX CONCURRENTLY IF EXISTS` ([04 §20.2.4](../04-domain-model-and-data-dictionary.md#2024-after-the-first-production-deploy-forward-only-expand-and-contract)).
   - CHECK-list and `NOT NULL` changes go through `NOT VALID` then `VALIDATE CONSTRAINT`.
6. **Cut-over.** Developers run `node ace migration:fresh --seed`, commit the regenerated `database/schema.ts` unedited, and rebase open branches.

   Edited 2026-10-04 (consistency review): because every pg-boss instance starts with its migration disabled (the 2026-10-01 note on decision 2), developers run `node ace migration:fresh`, then the pg-boss schema step, then `node ace db:seed`, so the dev seeders, which send jobs through the real actions, find the `pgboss` schema ([11 §4.4](../11-deployment-and-operations.md#44-local-setup-in-five-commands), [04 §20.2.3](../04-domain-model-and-data-dictionary.md#2023-steps)). The rest of the decision is unchanged.

## Alternatives considered

| Alternative                                  | Why rejected                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Incremental ALTER migrations on the 26 files | Dozens of conversions on empty tables. Review is harder, and the history keeps encoding the wrong decisions. |
| Keep editing migrations in place             | Environments drift from `database/schema.ts` and from each other (RF-41). Impossible once production exists. |
| Declarative diff tools (Atlas, migra)        | A second tool beside Lucid migrations. Diffs still need expand/contract judgement.                           |
| `schema:dump --prune` now                    | Freezes the defective schema. It is the right tool for squashing post-launch history later.                  |
| Squash after launch                          | Needs dump-and-restore alignment and puts records under legal retention at risk.                             |

## Consequences

**Positive**

- The first production schema enforces every invariant the other ADRs rely on (CHECKs, tenant FKs, append-only tables) from day one.
- `database/schema.ts`, the models and 04 agree. New developers read 14 files instead of 26 contradictory ones.

**Negative**

- All local and test data is discarded, and open branches must be rebased.
- Several days of M0 go into writing and reviewing the baseline before feature work.

**Risks**

- _OD-01 is wrong_ and a staging database holds data someone values. Mitigation: the product owner's confirmation recorded with OD-01 (2026-09-30), and a one-off export.
- _A baseline mistake is found after launch_ and then costs an expand/contract migration. Mitigation: constraint tests, and a two-person review (or a product-owner walkthrough when there is one developer).

## When to revisit

- A hosted database with real data is found before the baseline merges, despite OD-01: supersede this ADR with an incremental plan for the affected tables.
- 04 changes substantially before launch: the baseline may be re-squashed, **only before the first production deploy**.
- After launch this ADR is not revisited. Only a superseding ADR can change the forward-only rule.

## Verification

- **T-ARCH-010 (proposed)**: CI runs `migration:fresh` on `postgres:18.4`, then `git diff --exit-code database/schema.ts`.
- **T-ARCH-011 (proposed)**: CHECK value lists match the TypeScript arrays, and the set of cascading FKs equals 04 §2.6.
- **T-ARCH-012 (proposed)**: `UPDATE` and `DELETE` on each append-only table fail for both roles.
- **T-ARCH-013 / T-ARCH-014 (proposed)**: the int8 parser and the money-column lint (ADR-0007).
- **Constraint tests**: T-SEC-004 (refund CHECK), T-INV-003 (stock CHECK), T-ORD-104 (proposed, composite FK).
- **Migration immutability check** (T-ARCH-017, proposed; after launch): CI compares checksums against `database/migrations.lock`.
- **Lint rule** (its fixtures are part of T-ARCH-021, proposed): `database/migrations/**` may not import from `#constants/*`, `#models/*` or `#modules/*`.
- **Seeder guard test** (T-ARCH-019, proposed): a dev seeder with `NODE_ENV=production` exits non-zero.

## Related

- [04 §20 Migration from the current schema](../04-domain-model-and-data-dictionary.md#20-migration-from-the-current-schema)
- [00 Repository findings](../00-context-assumptions-and-questions.md)
- [Risks and open decisions (OD-01)](../risks-and-open-decisions.md#22-decision-table)
- [12 Roadmap (M0)](../12-roadmap-and-backlog.md)
- [ADR-0005](0005-session-auth-server-side-revocation.md), [ADR-0006](0006-authorization-platform-roles-shop-memberships.md), [ADR-0007](0007-money-integer-minor-units.md), [ADR-0008](0008-inventory-reservations-and-ledger.md), [ADR-0009](0009-multi-shop-orders-and-vendor-ledger.md), [ADR-0010](0010-postgres-jobs-pg-boss-transactional-send.md)

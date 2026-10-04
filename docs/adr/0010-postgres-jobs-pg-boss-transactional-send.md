# ADR-0010: Background jobs on PostgreSQL with pg-boss 12 and transactional send

Status: Draft v1 (2026-09-25)

Reviewed: 2026-09-25 · consistency review 2026-09-30 to 2026-10-04

## Status

- **Decision status:** Accepted. Handing a Lucid transaction to pg-boss is to be confirmed by the M0 spike T-ARCH-004 (proposed). If the spike fails, the defined outbox fallback applies without changing this decision.
- **Date:** 2026-09-25
- **Deciders:** lead developer
- **Supersedes / superseded by:** — / —
- **Related open items:** OD-10 resolved 2026-09-25 (limiter on the database store, so R1 needs no Redis)

Edited 2026-09-30 (consistency review): the T-ARCH-004 exit criterion in decision 2 also covers the queue policies of [03 §9](../03-system-architecture.md#9-asynchronous-work), as [12 §4.3](../12-roadmap-and-backlog.md#43-exit-criteria) item 7 asks; the decision is unchanged.

## Context

**Work outside the request** (catalogue in [03 §9](../03-system-architecture.md#9-asynchronous-work)):

- emails (FR-NOT-001, FR-NOT-002);
- payment verification, which is **required** because eSewa ePay and Khalti KPG-2 document no server-to-server webhooks (FR-PAY-003, ADR-0012);
- reservation expiry (ADR-0008);
- acceptance timeout (FR-ORD-004) and auto-complete (FR-ORD-006);
- listing refresh (ADR-0014) and media processing (ADR-0013);
- drift and integrity checks (FR-INV-005);
- SLA alerts (FR-ADM-009, FR-RET-007);
- session revocation (ADR-0005).

**Dual write.** If `placeOrder` commits and the process dies before it enqueues the email, the job is lost. If it enqueues first and then rolls back, an email is sent for an order that does not exist. Lucid's `trx.after('commit')` runs in memory and is lost on a crash [Verified-doc, Lucid 22.4.2 `TransactionClientContract.after`, accessed 2026-09-25].

**pg-boss** [Verified-doc, accessed 2026-09-25]:

- 12.34.0 was published 2026-09-23. It requires Node 22.12+ and PostgreSQL 13+, is MIT-licensed, relies on `SKIP LOCKED`, and its README says it "is maintained by one person" (<https://registry.npmjs.org/pg-boss>).
- `send` accepts a `db` option with a built-in Knex adapter: "If the transaction rolls back, so does the job" (<https://github.com/timgit/pg-boss/blob/master/docs/api/adapters.md>). Lucid's transaction client exposes `knexClient` [Verified-doc, `@adonisjs/lucid` 22.4.2 `build/src/types/database.d.ts`].
- It provides retries with backoff, dead-letter queues with `redrive`, and `singletonKey`. A job "can run twice and handlers should be idempotent" (<https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md>).
- Cron schedules take `tz`. Schedules are checked every 30 s, with at most one job per minute per schedule (<https://github.com/timgit/pg-boss/blob/master/docs/api/scheduling.md>).

**Alternatives** [Verified-doc, accessed 2026-09-25]:

- @adonisjs/queue 0.6.2 is "currently experimental. Its API may change between minor releases" (<https://docs.adonisjs.com/guides/digging-deeper/queues>).
- BullMQ's PostgreSQL backend arrived in v6.0.0 on 2026-07-30 (<https://docs.bullmq.io/changelog>). Its Redis mode needs `noeviction` and AOF (<https://docs.bullmq.io/guide/going-to-production>).
- DigitalOcean Managed Valkey starts at $15.00/month as published on 2026-09-25 (<https://docs.digitalocean.com/products/databases/valkey/details/pricing/>).

**Connections.** The DigitalOcean 1 GiB PostgreSQL plan allows 22 connections, and DigitalOcean recommends direct or session-mode connections for LISTEN/NOTIFY and advisory locks [Verified-doc, <https://docs.digitalocean.com/products/databases/postgresql/how-to/manage-connection-pools/>, accessed 2026-09-25].

## Decision

1. **pg-boss 12.x** (exact version pinned) runs in the `worker` process in its own `pgboss` schema, over a direct connection with a pool of 4. `web` only sends jobs. A send inside a request transaction reuses that transaction's connection. A rare send outside a transaction uses a 1-connection send-only instance ([03 §3.4](../03-system-architecture.md#34-postgresql-layout-and-connection-budget)).

   Edited 2026-10-01 (tech lead decision): `dripnepal_migrator` owns the `pgboss` schema, and pg-boss's own schema install or upgrade runs in the release container as the migrator, never when a process starts. Both pg-boss instances run as `dripnepal_app`, which has DML only: the worker's instance and the `web` send-only instance above. Both start with pg-boss's migration disabled. After every install or upgrade, including the reinstall after a restore from the dump, the release step re-grants, as the migrator and idempotently, `USAGE` on schema `pgboss` and `SELECT, INSERT, UPDATE, DELETE` on its tables to `dripnepal_app` ([07 §4.10](../07-security-threat-model-and-permissions.md#410-database-roles-and-grants), [11 §6.1](../11-deployment-and-operations.md#61-where-and-how-migrations-run), [03 §3.4](../03-system-architecture.md#34-postgresql-layout-and-connection-budget), [§5.4](../03-system-architecture.md#54-release-sequence) and [§10.1](../03-system-architecture.md#101-transactional-send-the-job-table-is-the-outbox) item 5, [09 §2.3](../09-code-structure-and-engineering-standards.md#23-how-modules-cooperate)). The pg-boss 12 option that disables the migration and the schema-step call are pseudocode until the M0 spike T-ARCH-004 (proposed) confirms them (03 §10.1 item 5). The rest of the decision is unchanged.

2. **Transactional send: the job table is the outbox.** Domain actions call `sendJob(trx, queue, data, { singletonKey, startAfter })`, which passes `db: fromKnex(trx.knexClient)`. The job therefore commits or rolls back with the state change ([03 §10.1](../03-system-architecture.md#101-transactional-send-the-job-table-is-the-outbox)).
   - **M0 spike T-ARCH-004 (proposed), exit criterion:** a rollback leaves no job; a commit makes the job visible; the send uses the transaction's own connection; the savepoint behaviour is documented. The spike also checks the queue policies of [03 §9](../03-system-architecture.md#9-asynchronous-work) that [11 §8.5](../11-deployment-and-operations.md#85-overlap-and-singleton-rules) assumes: keyed sends on `stately` queues; a running job's successor accepted; a sweeper re-send refused while one is queued; `standard` queues with no `singletonKey`. Its result (confirmed, or the fallback adopted) is recorded in this ADR ([12 §4.3](../12-roadmap-and-backlog.md#43-exit-criteria) item 7).
   - **Fallback:** an `outbox_events` table written in the business transaction, and a relay that claims rows with `FOR UPDATE SKIP LOCKED` and sends them to pg-boss. Handlers do not change.
3. **Idempotent handlers.** Payloads carry business IDs plus `request_id` and `causation_id`, never PII. A raw token appears only in the few queues that must carry one, encrypted, and those queues delete completed jobs after one day. Each effect is guarded by one of:
   - a unique key (`notification_deliveries.dedupe_key`, `ledger_entries.dedupe_key`, `provider_events (provider, provider_event_key)`, `payout_entries.ledger_entry_id`);
   - a compare-and-set transition (`UPDATE … WHERE status = :from`);
   - recomputation from source (listing refresh, drift checks).

   Edited 2026-10-04 (final review): one effect is guarded differently. The `refunds.execute` job sent by `retryRefund` is protected by `retryLimit: 0`: it runs once, and its dead letter is discarded, never redriven, because no unique key or compare-and-set stops a second provider call for the same attempt ([03 §9](../03-system-architecture.md#9-asynchronous-work), [11 §8.3](../11-deployment-and-operations.md#83-redrive-procedure)).

4. **Queues.** Names use underscores. [03 §9](../03-system-architecture.md#9-asynchronous-work) owns the catalogue, retries and dead-letter queues (`dlq.<queue>`). [05 §9.4](../05-order-payment-and-inventory-lifecycles.md#94-reconciliation-schedule) owns the order, payment, refund, inventory and ledger schedules. Examples:
   - `notifications.dispatch` writes one `notification_deliveries` row per recipient, then `notifications.send_email` sends each one.
   - `payments.verify` runs a lookup per attempt: every 1 min to 30 min, every 5 min to 2 h, every 30 min to 24 h, then `needs_review`. `payments.reconcile_sweeper` (every 5 min) re-sends lost verify jobs.
   - `inventory.expire_reservations` runs every minute.
   - `orders.acceptance_timeout` is a delayed job at `acceptance_due_at`, backed by a 15-minute sweeper.
   - `inventory.drift_check` (02:30) and `ledger.integrity_check` (03:00) run daily.
   - All crons use `tz: 'Asia/Kathmandu'`.
5. **Observability.** `platform.heartbeat` pings an external monitor every 5 minutes. Alerts fire on any non-empty dead-letter queue and on the age of the oldest queued job per queue (thresholds in [11](../11-deployment-and-operations.md)).

## Alternatives considered

| Alternative                        | Why rejected                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @adonisjs/queue 0.6                | Best framework fit, but officially experimental. Revisit at 1.0. `sendJob` keeps the switch cheap.                                                         |
| BullMQ + Redis                     | Another stateful service (`noeviction`, AOF, about $15/month managed), and jobs cannot join the PostgreSQL transaction, so the dual-write problem remains. |
| BullMQ PostgreSQL backend          | About two months old at decision time. pg-boss has a longer PostgreSQL-only history.                                                                       |
| `trx.after('commit')` dispatch     | Lost on a crash or deploy between commit and dispatch, with no retries or dead-letter queue.                                                               |
| OS cron / `node ace` in containers | No retries, locking or dead-letter queue. Two instances would run each job twice.                                                                          |
| Hand-written queue table           | Rebuilds retries, backoff, scheduling and dead-letter queues. Kept only as the outbox fallback.                                                            |

## Consequences

**Positive**

- A state change and its follow-up work commit together. An order either exists with its email job queued, or neither exists.
- One datastore to back up and restore (ADR-0016). Jobs survive restarts and deploys.
- Crons run in Nepal time (UTC+05:45, no daylight saving), so there are no skipped or repeated hours.

**Negative**

- Job tables add write and vacuum load to the checkout database and use 5 of its 22 connections (worker pool plus the send-only instance).
- At-least-once delivery makes idempotency mandatory for every handler, which adds review work.
- The dependency has one maintainer (bus factor 1).

**Risks**

- _The Lucid-to-Knex handoff fails._ Mitigation: the outbox fallback, decided in M0 before any feature depends on it.
- _pg-boss is abandoned._ Mitigation: the pinned version and the `sendJob` seam. Candidates to switch to: @adonisjs/queue 1.0, or BullMQ.

## When to revisit

- Sustained throughput above about 50 jobs/s, or job pickup p95 above 30 s [Assumption].
- PostgreSQL CPU above 60% at peak with pg-boss queries among the top consumers.
- No pg-boss release for 6 months while a critical issue stays open, or a licence change.
- @adonisjs/queue reaches 1.0 with transactional enqueue.

## Verification

- **T-ARCH-004 (proposed)**: the transactional-send spike above, kept as a regression test.
- **T-CHK-008 (proposed)**: a rolled-back checkout sends no job.
- **T-PAY-005**: duplicate and concurrent events give one state change and one ledger posting.
- **Double-run tests** in the T-NOT, T-LED and T-INV suites (for example T-INV-004, T-LED-005): each handler run twice has one effect.
- **T-OPS-002 (proposed)**: SIGTERM during a long job gives one completion and no duplicate effect.
- **Alert test** (T-OPS-018, proposed; [10 §6.8](../10-testing-and-quality-gates.md#68-notifications-administration-and-operations-t-not-t-adm-t-ops)): an exhausted job fires the dead-letter alert, and a stopped worker misses its heartbeat.
- **Config test** (proposed): the sum of pool maxima in 03 §3.4 does not exceed 22.
- **Grant check** (T-SEC-029, proposed; [07 §4.10](../07-security-threat-model-and-permissions.md#410-database-roles-and-grants)): after a fresh release-step install of the `pgboss` schema and after a restore drill, `dripnepal_app` can send, fetch and complete a job.

## Related

- [03 §9–10 Asynchronous work and reliable delivery](../03-system-architecture.md#9-asynchronous-work)
- [05 §9.4 Reconciliation schedule](../05-order-payment-and-inventory-lifecycles.md#94-reconciliation-schedule)
- [04a §15.5 pg-boss schema](../04a-data-dictionary-tables.md#155-pg-boss-schema-pgboss)
- [ADR-0002](0002-modular-monolith-adonisjs.md), [ADR-0008](0008-inventory-reservations-and-ledger.md), [ADR-0012](0012-payment-provider-isolation-verify-by-lookup.md), [ADR-0013](0013-media-direct-upload-async-processing.md), [ADR-0014](0014-postgres-search-and-listing-read-model.md), [ADR-0016](0016-hosting-single-region-portable.md)

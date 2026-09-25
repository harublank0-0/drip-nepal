# ADR-0010: Background jobs on PostgreSQL with pg-boss 12 and transactional send

Status: Draft v1 (2026-09-25)

## Status

| Field | Value |
|---|---|
| Decision status | **Accepted.** The transactional-send mechanism is confirmed by the M0 spike, and a fallback is defined below. |
| Date | 2026-09-25 |
| Deciders | Lead developer |
| Supersedes | — |
| Superseded by | — |
| Related open items | OD-10 resolved 2026-09-25 (limiter on the database store, so no Redis is needed for R1) |

## Context

**Work that must happen outside the request:**
- order and account emails (FR-NOT-001/002);
- gateway-payment reconciliation, which is **required** because neither eSewa ePay nor Khalti KPG-2 documents server-to-server webhooks (FR-PAY-003, ADR-0012);
- reservation expiry (ADR-0008);
- vendor acceptance timeout auto-cancel (FR-ORD-004) and auto-complete after the return window (FR-ORD-006);
- `product_listings` refresh (ADR-0014) and media processing (ADR-0013);
- idempotency-key purge (ADR-0004), inventory drift detection (FR-INV-005), and the support-case 15-day and refund 7-day SLA alerts (FR-ADM-009, FR-RET-007);
- session cleanup (ADR-0005).

**The dual-write problem.** If `placeOrder` commits and the process then crashes before enqueueing "send confirmation email", the job is lost. If the job is enqueued first and the transaction rolls back, an email goes out for an order that does not exist. Lucid's `trx.after('commit')` runs in memory and is not durable [Verified-doc, Lucid 22.4.2 `TransactionClientContract.after`, accessed 2026-09-25].

**pg-boss facts** [Verified-doc, accessed 2026-09-25]:
- Latest is 12.34.0 (npm, 2026-09-23). Requires Node ≥ 22.12 and PostgreSQL ≥ 13, uses `SKIP LOCKED`, and is MIT-licensed; the README says it "is maintained by one person" (https://registry.npmjs.org/pg-boss, https://github.com/timgit/pg-boss).
- `send/insert/fetch/complete` accept a `db` option with built-in adapters including Knex (`fromKnex`): "If the transaction rolls back, so does the job." (https://github.com/timgit/pg-boss/blob/master/docs/api/adapters.md). Whether a Lucid transaction client can be handed to `fromKnex` needs a code spike.
- Retries with exponential backoff and jitter, dead-letter queues with `redrive()`, `singletonKey` deduplication, and a `key_strict_fifo` policy (https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md).
- A job "can run twice and handlers should be idempotent".
- Cron or RRULE schedules with a `tz` option, checked every 30 s, at most one job per minute per schedule (https://github.com/timgit/pg-boss/blob/master/docs/api/scheduling.md).

**Alternatives' facts** [Verified-doc, accessed 2026-09-25]:
- @adonisjs/queue 0.6.2 is documented as "currently experimental. Its API may change between minor releases" (https://docs.adonisjs.com/guides/digging-deeper/queues).
- BullMQ 6's PostgreSQL backend shipped in v6.0.0 on 2026-07-30, and its docs call Redis "the most battle-tested option" (https://docs.bullmq.io/guide/postgresql).
- Managed Valkey starts at $15.00/month as published on 2026-09-25.

**Connections.** DigitalOcean's 1 GiB PostgreSQL plan allows 22 connections. PgBouncer transaction mode breaks LISTEN/NOTIFY and advisory-lock users, so queue workers must connect directly [Verified-doc, https://docs.digitalocean.com/products/databases/postgresql/how-to/manage-connection-pools/, accessed 2026-09-25].

## Decision

1. **pg-boss 12.x** (exact version pinned in `package.json`) runs in the `worker` process (ADR-0002). `web` processes only *send* jobs and never call `work()`. They send through the adapter over Lucid's connection, so they use the web pool and need no extra connections; the M0 spike confirms this. In `worker`, pg-boss keeps its tables in its own `pgboss` schema, has a dedicated pool of max 4 connections, and connects directly, not through a transaction-mode pooler.
2. **Transactional send: the job table is the outbox.** Domain actions send jobs through `JobBus.send(name, payload, { trx, singletonKey, startAfter })` in `app/modules/platform`. With a `trx`, the adapter passes pg-boss's `db` option wrapping the Lucid transaction's underlying Knex client, so the job commits or rolls back with the state change.
   - **M0 spike (exit criterion):** a test shows that a rollback leaves no job and a commit makes the job visible.
   - **Fallback, if the handoff fails:** an `outbox_events` table in the `platform` module, written in the business transaction, plus a relay job that claims rows with `FOR UPDATE SKIP LOCKED`, sends them to pg-boss and marks them relayed. `JobBus` hides which mechanism is in use.
3. **Handlers are idempotent.** Payloads carry business IDs only, never PII: pg-boss keeps completed jobs for its retention period. Each handler guards its effect with:
   - a unique key (`notification_deliveries.dedupe_key`, `ledger_entries.dedupe_key`, `provider_events (provider, provider_event_key)`); or
   - a compare-and-set state transition (`UPDATE … WHERE status = :from`, docs/05).
4. **Queues, policies and schedules** (initial values [Assumption]; the full table is in [docs/03](../03-system-architecture.md)):

   | Queue | Trigger | Retry | Idempotency guard |
   |---|---|---|---|
   | `notifications.send` | domain events (order placed, shop order accepted…) | 5, exponential backoff, DLQ | `notification_deliveries.dedupe_key` |
   | `payments.verify` | return handler, webhook, reconciliation cron | 10, backoff, `singletonKey = payment_id`, DLQ | payment compare-and-set |
   | `payments.reconcile` | cron every minute, tz `Asia/Kathmandu` | cron re-runs | selects `next_verification_at <= now()` |
   | `inventory.expire_reservations` | cron every minute | cron re-runs | reservation compare-and-set |
   | `orders.acceptance_timeout` | cron every 5 min | cron re-runs | shop-order compare-and-set |
   | `orders.auto_complete` | cron hourly | cron re-runs | shop-order compare-and-set |
   | `catalog.refresh_listing` | catalog, inventory and shop events; nightly full rebuild 02:30 NPT | 5, DLQ | upsert by `product_id` |
   | `media.process` | `completeMediaUpload` | 3, DLQ, concurrency 1 | `media_assets.status` compare-and-set |
   | `platform.purge` | cron daily 03:00 NPT (idempotency keys, sessions, orphaned uploads) | cron re-runs | delete by age |
   | `inventory.drift_check`, `platform.sla_alerts` | cron nightly / hourly | cron re-runs | read-only + alert dedupe |

5. **Observability.** The worker sends a heartbeat to the uptime monitor every minute. Alerts fire on: any dead-letter queue depth > 0; oldest queued job > 5 min; `payments.reconcile` not completed for 3 minutes ([docs/11](../11-deployment-and-operations.md)).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| @adonisjs/queue 0.6 (database driver, SKIP LOCKED, Adonis DI) | Best framework fit, but officially experimental with API changes between minor releases. Revisit at 1.0. `JobBus` keeps the switch cheap. |
| BullMQ + Redis | Another stateful service with `noeviction` + AOF requirements. Jobs cannot be enqueued in the PostgreSQL transaction, so the dual-write problem remains. |
| BullMQ PostgreSQL backend | Two months old at decision time. pg-boss has years of PostgreSQL-only production history. |
| `trx.after('commit')` in-process dispatch | Lost on crash or deploy between commit and dispatch. No retries, no DLQ. |
| OS cron / `node ace` commands in containers | No retries, locking or DLQ. Running two instances would double-run jobs. |
| Hand-written queue table | Rebuilding retries, backoff, DLQ, scheduling and expiry. Kept only as the outbox fallback. |

## Consequences

**Positive**
- State changes and their follow-up work commit atomically. An order either exists with its email job queued, or neither exists.
- One datastore to back up and restore (ADR-0016). Jobs survive restarts and deploys.
- Cron schedules run in Nepal time, so "daily at 03:00" means 03:00 NPT.

**Negative**
- Job tables add write and vacuum load to the same PostgreSQL that serves checkout, and 4 of the 22 connections.
- At-least-once delivery makes idempotency mandatory for every handler, which is a review burden.
- Single-maintainer dependency (bus factor 1).

**Risks**
- *The Lucid→Knex handoff does not work.* Mitigation: the defined outbox fallback; decided in M0 before any feature depends on it.
- *pg-boss becomes unmaintained.* Mitigation: `JobBus` abstraction and the pinned version. Candidates to switch to: @adonisjs/queue at 1.0, or BullMQ.

## When to revisit

- Sustained throughput above about 50 jobs/s, or job pickup latency p95 above 30 s.
- PostgreSQL CPU above 60 % at peak with pg-boss queries among the top consumers.
- pg-boss has no release for 6 months while a critical issue stays open, or its licence changes.
- @adonisjs/queue reaches 1.0 with transactional enqueue support.

## Verification

- **M0 spike test** (`tests/functional/platform/transactional_send.spec.ts`): send in a transaction, roll back, assert no job; send and commit, assert the job exists.
- **T-PAY-005**: duplicate and concurrent deliveries produce one state change and one ledger posting.
- **Handler double-run tests** (T-NOT, T-LED, T-INV suites in [docs/10](../10-testing-and-quality-gates.md)): every handler runs twice with the same payload, and the side effects happen once (one email row, one ledger entry).
- **T-OPS suite**: the DLQ alert fires when a job exhausts its retries, and the heartbeat alert fires when the worker is stopped.
- **Connection budget check**: a config test asserts web pool + worker Lucid pool + pg-boss pool + admin ≤ 18 (leaving 4 of 22 for headroom).

## Related

- [Architecture: processes, modules and jobs](../03-system-architecture.md)
- [Deployment and operations (alerts, runbooks)](../11-deployment-and-operations.md)
- ADR-0002 (process types), ADR-0008, ADR-0012, ADR-0013, ADR-0014 (job consumers), ADR-0016 (connection budget)

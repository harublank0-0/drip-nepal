import { PgBoss, fromKnex } from 'pg-boss'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/*
 * Jobs run on pg-boss in PostgreSQL (ADR-0010). A job is sent inside the
 * transaction of the change that causes it, through that transaction's own
 * connection, so it exists only if the change commits (docs/03 §10.1,
 * docs/09 §2.3 rule 4). The M0 spike T-ARCH-004 proved the calls below on
 * pg-boss 12.38.0 (tests/concurrency/platform/pgboss.spec.ts).
 */

// The schema pg-boss keeps its tables in (docs/04a §15.5).
export const JOB_SCHEMA = 'pgboss'

// The runtime role, which gets DML on the schema and nothing else (docs/07 §4.10).
export const JOB_APP_ROLE = 'dripnepal_app'

/*
 * Each module adds its queues and payloads by declaration merging in its
 * events.ts, so `platform` never imports a higher module (docs/09 §2.3):
 *
 *   declare module '#modules/platform/jobs' {
 *     interface JobPayloads { 'orders.acceptance_timeout': { shop_order_id: string } }
 *   }
 */
export interface JobPayloads {}
export type QueueName = keyof JobPayloads & string

// Every payload carries the request that caused it (docs/09 §7.4).
export type JobEnvelope = { request_id: string | null; causation_id: string | null }

export interface JobDatabase {
  host: string
  port: number
  user: string
  password: string
  database: string
  // The same TLS options as Lucid's connection (docs/11 §1); none in development.
  ssl?: unknown
}

// Pool sizes from the connection budget of docs/03 §3.4.
const POOL_MAX = { worker: 4, web: 1 } as const

/*
 * The options of a pg-boss instance as the runtime role. Nothing here may
 * make pg-boss run DDL, which `dripnepal_app` cannot do (docs/07 §4.10):
 * - `migrate` and `createSchema` off: the release step installs and
 *   upgrades the schema as the migrator (`node ace jobs:install`);
 * - `persistQueueStats` off (pg-boss's default, kept explicit): recorded
 *   stats create a table partition each day;
 * - `reindex` off: pg-boss's automatic rebuild of bloated job indexes runs
 *   `REINDEX`, so the operator runs it as the migrator instead (docs/11 §6.1).
 * The worker's instance supervises and runs schedules; the web process's
 * instance only sends.
 */
export function jobBossOptions(db: JobDatabase, role: 'worker' | 'web') {
  return {
    ...db,
    max: POOL_MAX[role],
    schema: JOB_SCHEMA,
    migrate: false,
    createSchema: false,
    persistQueueStats: false,
    reindex: false,
    supervise: role === 'worker',
    schedule: role === 'worker',
  }
}

export function createJobBoss(db: JobDatabase, role: 'worker' | 'web') {
  return new PgBoss(jobBossOptions(db, role))
}

/*
 * The process's instance, set by the service provider that starts it (or by
 * a test), so actions call `sendJob(trx, …)` without carrying it.
 */
let current: PgBoss | null = null

export function setJobBoss(boss: PgBoss | null) {
  current = boss
}

function jobBoss() {
  if (!current) throw new Error('No pg-boss instance: the jobs provider has not started')
  return current
}

/*
 * Installs or upgrades the pg-boss schema as the migrator. An upgrade may
 * queue commands that run outside its transaction (`CREATE INDEX
 * CONCURRENTLY`, pg-boss's "bam" table); only an instance with migration on
 * runs them, so this waits until none is pending and fails on a failed one.
 * The caller then runs the grants of `jobSchemaGrants()` (docs/11 §6.1).
 */
export async function installJobSchema(
  migrator: JobDatabase,
  options: { timeoutMs?: number } = {}
) {
  const boss = new PgBoss({
    ...migrator,
    max: 2,
    schema: JOB_SCHEMA,
    migrate: true,
    createSchema: true,
    supervise: false,
    schedule: false,
    // pg-boss runs the queued commands on this timer only, not at start; 10 s is its minimum.
    bamIntervalSeconds: 10,
  })
  const errors: unknown[] = []
  boss.on('error', (error) => errors.push(error))
  await boss.start()
  try {
    const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000)
    for (;;) {
      const status = await boss.getBamStatus()
      const failed = status.find((row) => row.status === 'failed' && row.count > 0)
      if (failed) throw new Error(`pg-boss schema upgrade: ${failed.count} command(s) failed`)
      const open = status.some(
        (row) => (row.status === 'pending' || row.status === 'in_progress') && row.count > 0
      )
      if (!open) break
      if (Date.now() > deadline) throw new Error('pg-boss schema upgrade: commands still pending')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (errors.length > 0) throw errors[0]
  } finally {
    await boss.stop({ graceful: true, close: true })
  }
}

/*
 * The idempotent grants that follow every install or upgrade, including the
 * reinstall after a restore (docs/07 §4.10, docs/04a §15.5). pg-boss 12
 * creates no sequence; its functions keep PostgreSQL's default EXECUTE for
 * PUBLIC, which USAGE on the schema makes reachable.
 */
export function jobSchemaGrants(role = JOB_APP_ROLE) {
  return [
    `GRANT USAGE ON SCHEMA ${JOB_SCHEMA} TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${JOB_SCHEMA} TO ${role}`,
  ]
}

export interface SendJobOptions {
  // A key only on the stately queues of docs/03 §9.
  singletonKey?: string
  startAfter?: number | Date
  // 0 only on the refunds.execute job of retryRefund (docs/03 §9).
  retryLimit?: number
}

/*
 * Sends a job inside `trx`, on the transaction's own connection
 * (pg-boss's Knex adapter over Lucid's `trx.knexClient`). The job is
 * visible to workers only once `trx` commits; a rollback, or the rollback
 * of a savepoint the send ran in, removes it. Returns the job ID, or null
 * when a queue policy refused the job (a stately or singleton duplicate).
 * pg-boss may read its queue list on its own pool the first time it meets
 * a queue; the job itself is always written on `trx`.
 */
export function sendJob<Q extends QueueName>(
  trx: TransactionClientContract,
  queue: Q,
  data: JobPayloads[Q] & JobEnvelope,
  options: SendJobOptions = {}
) {
  return jobBoss().send(queue, data as object, { ...options, db: fromKnex(trx.knexClient) })
}

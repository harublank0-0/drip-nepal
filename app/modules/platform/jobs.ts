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
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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
}

/*
 * A pg-boss instance as the runtime role. Its migration is off, so it never
 * creates or alters the schema: the release step does that as the migrator
 * (`node ace jobs:install`, docs/11 §6.1). The worker's instance supervises
 * and runs schedules; the web process's instance only sends.
 */
export function jobBossOptions(db: JobDatabase, role: 'worker' | 'web') {
  return {
    ...db,
    schema: JOB_SCHEMA,
    migrate: false,
    createSchema: false,
    supervise: role === 'worker',
    schedule: role === 'worker',
  }
}

export function createJobBoss(db: JobDatabase, role: 'worker' | 'web') {
  return new PgBoss(jobBossOptions(db, role))
}

/*
 * Installs or upgrades the pg-boss schema as the migrator, then stops. The
 * caller runs the grants of `jobSchemaGrants()` afterwards, in the same
 * release step.
 */
export async function installJobSchema(migrator: JobDatabase) {
  const boss = new PgBoss({
    ...migrator,
    schema: JOB_SCHEMA,
    migrate: true,
    createSchema: true,
    supervise: false,
    schedule: false,
  })
  boss.on('error', () => {})
  await boss.start()
  await boss.stop({ graceful: false, close: true })
}

/*
 * The idempotent grants that follow every install or upgrade, including the
 * reinstall after a restore (docs/07 §4.10, docs/04a §15.5). Sequences are
 * included because pg-boss may use them; functions keep PostgreSQL's
 * default EXECUTE for PUBLIC, which USAGE on the schema makes reachable.
 */
export function jobSchemaGrants(role = JOB_APP_ROLE) {
  return [
    `GRANT USAGE ON SCHEMA ${JOB_SCHEMA} TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${JOB_SCHEMA} TO ${role}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${JOB_SCHEMA} TO ${role}`,
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
 */
export function sendJob<Q extends QueueName>(
  boss: PgBoss,
  trx: TransactionClientContract,
  queue: Q,
  data: JobPayloads[Q] & JobEnvelope,
  options: SendJobOptions = {}
) {
  return boss.send(queue, data as object, { ...options, db: fromKnex(trx.knexClient) })
}

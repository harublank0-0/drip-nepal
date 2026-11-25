import { PgBoss, fromKnex, type Queue } from 'pg-boss'
import type { PostgreConfig, TransactionClientContract } from '@adonisjs/lucid/types/database'

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

/*
 * The pg-boss connection settings of a Lucid connection's configuration, or
 * null when it does not name a host, user and database (a connection
 * string or a function). Commands use it to reach pg-boss as the same role
 * as their Lucid connection.
 */
export function jobDatabaseOf(config: PostgreConfig | undefined): JobDatabase | null {
  const connection = config?.connection
  if (!connection || typeof connection !== 'object' || !('user' in connection)) return null
  return {
    host: String(connection.host),
    port: Number(connection.port),
    user: String(connection.user),
    password: String(connection.password),
    database: String(connection.database),
    ssl: 'ssl' in connection ? connection.ssl : undefined,
  }
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

export function hasJobBoss() {
  return current !== null
}

/*
 * The queues the application sends to, created or updated by the schema
 * step (`node ace jobs:install`) as the migrator, so a send never meets a
 * missing queue and no runtime instance creates one (proposed, docs/09
 * §2.3). A queue is added here with its first sender. Names and settings
 * are docs/03 §9's: the defaults [Assumption there], each row's retry
 * count and first delay, a dead-letter queue per queue, and on the queues
 * that carry `token_enc` (both `notifications.*` queues) completed jobs
 * deleted after one day and queued ones after 7 days, the longest token
 * lifetime (docs/07 §3.8 rule 2). Dead-letter queues have no worker. Every
 * setting is one `updateQueue` accepts, so the next `jobs:install` applies
 * a changed value to an existing queue.
 */
const QUEUE_DEFAULTS = { retryBackoff: true, retryDelayMax: 3600, expireInSeconds: 120 }
const TOKEN_RETENTION = { deleteAfterSeconds: 86_400, retentionSeconds: 604_800 }

// `standard` policy, no partition (docs/09 §2.3: both would need DDL at runtime).
export type QueueSettings = Omit<
  Queue,
  'name' | 'policy' | 'partition' | 'deadLetter' | 'heartbeatSeconds'
>

// Queues declared in `JobPayloads`; tests name their own `t_<test id>.*` queues and create them.
export type ApplicationQueueName = Exclude<QueueName, `t_${string}`>

// `satisfies`: a queue declared in `JobPayloads` but missing here fails `pnpm typecheck`.
export const JOB_QUEUES = {
  'notifications.dispatch': { ...QUEUE_DEFAULTS, retryLimit: 5, ...TOKEN_RETENTION },
  // 8 retries, backoff from 60 s up to `retryDelayMax` (1 h); M1 part 1b.
  'notifications.send_email': {
    ...QUEUE_DEFAULTS,
    retryLimit: 8,
    retryDelay: 60,
    ...TOKEN_RETENTION,
  },
  // 5 retries with backoff; carries the user ID only (M1 part 4).
  'identity.revoke_sessions': { ...QUEUE_DEFAULTS, retryLimit: 5 },
  // 5 retries with backoff (docs/03 §9; R1-S part 2a).
  'catalog.refresh_listing': { ...QUEUE_DEFAULTS, retryLimit: 5 },
  // 03 §9: 3 retries from 30 s; image work gets 300 s before it counts as expired.
  'media.process_upload': {
    ...QUEUE_DEFAULTS,
    retryLimit: 3,
    retryDelay: 30,
    expireInSeconds: 300,
  },
  // 03 §9: daily, 3 retries; a run deletes up to 1,000 objects one by one, so 15 minutes.
  'media.cleanup_abandoned': { ...QUEUE_DEFAULTS, retryLimit: 3, expireInSeconds: 900 },
  // M6 courier queues (docs/03 §9 rows added with them, 2026-11-21).
  'logistics.verify_account': { ...QUEUE_DEFAULTS, retryLimit: 5 },
  'logistics.sync_branches': { ...QUEUE_DEFAULTS, retryLimit: 3 },
  'orders.book_courier_shipment': { ...QUEUE_DEFAULTS, retryLimit: 3, retryDelay: 30 },
  'orders.process_courier_event': { ...QUEUE_DEFAULTS, retryLimit: 5, retryDelay: 60 },
  'orders.poll_courier_statuses': { ...QUEUE_DEFAULTS, retryLimit: 1 },
  'orders.sweep_courier_bookings': { ...QUEUE_DEFAULTS, retryLimit: 1 },
  'orders.sweep_courier_events': { ...QUEUE_DEFAULTS, retryLimit: 1 },
} satisfies Record<ApplicationQueueName, QueueSettings>

export const deadLetterQueue = (queue: string) => `dlq.${queue}`

/*
 * What `node ace jobs:redrive` may do with each queue's dead letters
 * (proposed, docs/09 §9.7; the groups of docs/11 §8.2):
 * - `redrive`: after the fix, back to the queue; the handler re-reads
 *   current rows and is idempotent, so it does the remaining work once;
 * - `discard`: a sweeper or the next scheduled run re-sends the work, so a
 *   redrive could only repeat it (a courier booking, a poll).
 * A queue joins with its rule; `satisfies` makes a queue of `JOB_QUEUES`
 * without one a type error. `refunds.execute`, whose dead letters are
 * handled job by job (docs/11 §8.3 step 4), adds that mode when it joins.
 */
export type DeadLetterRule = 'redrive' | 'discard'

export const DEAD_LETTER_RULES = {
  'notifications.dispatch': 'redrive',
  'notifications.send_email': 'redrive',
  'identity.revoke_sessions': 'redrive',
  'catalog.refresh_listing': 'redrive',
  'media.process_upload': 'redrive',
  'media.cleanup_abandoned': 'discard',
  'logistics.verify_account': 'redrive',
  'logistics.sync_branches': 'redrive',
  'orders.book_courier_shipment': 'discard',
  'orders.process_courier_event': 'redrive',
  'orders.poll_courier_statuses': 'discard',
  'orders.sweep_courier_bookings': 'discard',
  'orders.sweep_courier_events': 'discard',
} as const satisfies Record<ApplicationQueueName, DeadLetterRule>

/*
 * Creates each queue of `queues` and its dead-letter queue, or updates
 * their settings. pg-boss refuses an option key whose value is undefined
 * (`retentionSeconds` must then be >= 1), so the dead-letter queue gets
 * the key only when its queue sets it.
 */
export async function ensureQueues(
  boss: PgBoss,
  queues: Record<string, QueueSettings> = JOB_QUEUES
) {
  for (const [name, options] of Object.entries(queues)) {
    const dlq = deadLetterQueue(name)
    const parking: QueueSettings = {}
    if (options.retentionSeconds !== undefined) parking.retentionSeconds = options.retentionSeconds
    // `updateQueue` refuses an empty update, so a dead-letter queue with defaults is left as it is.
    if (!(await boss.getQueue(dlq))) await boss.createQueue(dlq, parking)
    else if (Object.keys(parking).length > 0) await boss.updateQueue(dlq, parking)
    const settings = { ...options, deadLetter: dlq }
    if (await boss.getQueue(name)) await boss.updateQueue(name, settings)
    else await boss.createQueue(name, settings)
  }
}

/*
 * Installs or upgrades the pg-boss schema as the migrator. An upgrade may
 * queue commands that run outside its transaction (`CREATE INDEX
 * CONCURRENTLY IF NOT EXISTS`, pg-boss's "bam" table); only an instance with
 * migration on runs them, so this waits until none is pending, running or
 * failed. pg-boss retries a failed one on its next pass, so a row left
 * failed by an earlier, interrupted run heals here; the step fails only if
 * one is still unfinished at the deadline. Then it creates or updates the
 * queues of `JOB_QUEUES`. The caller then runs the grants of
 * `jobSchemaGrants()` (docs/11 §6.1).
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
      const open = status.filter((row) => row.status !== 'completed' && row.count > 0)
      if (open.length === 0) break
      if (Date.now() > deadline) {
        const left = open.map((row) => `${row.count} ${row.status}`).join(', ')
        throw new Error(`pg-boss schema upgrade unfinished: ${left}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    await ensureQueues(boss)
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

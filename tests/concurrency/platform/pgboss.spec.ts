import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { getRollbackPlans, type PgBoss } from 'pg-boss'
import {
  JOB_SCHEMA,
  createJobBoss,
  installJobSchema,
  jobBossOptions,
  sendJob,
  setJobBoss,
} from '#modules/platform/jobs'
import { MIGRATOR_CONNECTION } from '#tests/support/database'

/*
 * T-ARCH-004: the M0 spike of docs/03 §10.1, kept as a regression test
 * (ADR-0010). It runs in the concurrency suite, which commits for real, as
 * `dripnepal_app` against a `pgboss` schema that the test setup hook
 * installed fresh as `dripnepal_migrator` (`node ace jobs:install`). It proves:
 * 1. a job sent in a transaction that rolls back is never visible;
 * 2. after commit the job is fetched and completed;
 * 3. the send runs in the transaction itself, and takes no second Lucid connection;
 * 4. a send in a savepoint that rolls back is removed with it;
 * 5. instances started as the runtime role with migration off work without
 *    DDL, the worker's supervise pass included;
 * 6. the queue policies of docs/03 §9 and docs/11 §8.5.
 * It also proves that the schema step upgrades an older schema, and holds
 * the uuidv7() check of docs/04 §2.1.
 */

declare module '#modules/platform/jobs' {
  interface JobPayloads {
    't_arch_004.standard': { n: number }
    't_arch_004.stately': { n: number }
    't_arch_004.worked': { n: number }
  }
}

const STANDARD = 't_arch_004.standard'
const STATELY = 't_arch_004.stately'
const WORKED = 't_arch_004.worked'
const envelope = { request_id: null, causation_id: null }

function appDatabase() {
  return {
    host: env.get('DB_HOST'),
    port: env.get('DB_PORT'),
    user: env.get('DB_USER'),
    password: env.get('DB_PASSWORD'),
    database: env.get('DB_DATABASE'),
  }
}

async function queuedJobs(queue: string) {
  const result = await db.rawQuery(
    `SELECT count(*)::int AS n FROM ${JOB_SCHEMA}.job WHERE name = ? AND state = 'created'`,
    [queue]
  )
  return result.rows[0].n as number
}

test.group('T-ARCH-004 pg-boss transactional send', (group) => {
  let boss: PgBoss | undefined
  let worker: PgBoss | undefined
  // Errors pg-boss reports from either instance; any one fails the test it happened in.
  const errors: unknown[] = []

  group.setup(async () => {
    const teardown = async () => {
      setJobBoss(null)
      await boss?.stop({ graceful: false, close: true })
      await worker?.stop({ graceful: false, close: true })
    }
    try {
      // Point 5: both runtime instances start as dripnepal_app with migration off.
      boss = createJobBoss(appDatabase(), 'web')
      worker = createJobBoss(appDatabase(), 'worker')
      boss.on('error', (error) => errors.push(error))
      worker.on('error', (error) => errors.push(error))
      await boss.start()
      await worker.start()
      setJobBoss(boss)
      await boss.createQueue(STANDARD, { policy: 'standard' })
      await boss.createQueue(STATELY, { policy: 'stately' })
      await boss.createQueue(WORKED, { policy: 'standard' })
    } catch (error) {
      await teardown()
      throw error
    }
    return teardown
  })

  group.each.teardown(() => {
    const first = errors.shift()
    errors.length = 0
    if (first) throw first
  })

  test('1. a job sent in a transaction that rolls back is never visible', async ({ assert }) => {
    await assert.rejects(
      () =>
        db.transaction(async (trx) => {
          const id = await sendJob(trx, STANDARD, { n: 1, ...envelope })
          assert.isString(id, 'the send itself succeeded')
          throw new Error('roll back')
        }),
      /roll back/
    )
    assert.equal(await queuedJobs(STANDARD), 0)
    assert.lengthOf(await worker!.fetch(STANDARD), 0)
  })

  test('2. after commit the job is fetched and completed', async ({ assert }) => {
    const id = await db.transaction((trx) => sendJob(trx, STANDARD, { n: 2, ...envelope }))
    assert.isString(id)
    const [job] = await worker!.fetch<{ n: number }>(STANDARD)
    assert.equal(job.id, id)
    assert.equal(job.data.n, 2)
    await worker!.complete(STANDARD, job.id)
    const done = await worker!.getJobById(STANDARD, job.id)
    assert.equal(done?.state, 'completed')
  })

  test('3. the send runs in the transaction itself, on a pool of one connection', async ({
    assert,
  }) => {
    const base = db.manager.get('pg')!.config
    db.manager.add('t_arch_004_one', { ...base, pool: { min: 0, max: 1 } })
    try {
      const one = db.connection('t_arch_004_one')
      await one.transaction(async (trx) => {
        // With one Lucid connection, a send that took a second one would hang here.
        const id = await sendJob(trx, STANDARD, { n: 3, ...envelope })
        // The row was written by this transaction: its xmin is this transaction's ID.
        const row = await trx.rawQuery(
          `SELECT xmin::text = (pg_current_xact_id()::text::bigint % 4294967296)::text AS own
             FROM ${JOB_SCHEMA}.job WHERE id = ?`,
          [id!]
        )
        assert.isTrue(row.rows[0]?.own, 'the job row belongs to this transaction')
        assert.equal(await queuedJobs(STANDARD), 0, 'no one else sees it before commit')
      })
      assert.equal(await queuedJobs(STANDARD), 1)
    } finally {
      await db.manager.close('t_arch_004_one')
      db.manager.release('t_arch_004_one')
      await boss!.deleteQueuedJobs(STANDARD)
    }
  }).timeout(10_000)

  test('4. a send in a savepoint that rolls back is removed with it', async ({ assert }) => {
    await db.transaction(async (trx) => {
      await assert.rejects(
        () =>
          trx.transaction(async (savepoint) => {
            assert.isString(await sendJob(savepoint, STANDARD, { n: 40, ...envelope }))
            throw new Error('roll back the savepoint')
          }),
        /roll back the savepoint/
      )
      await trx.transaction((savepoint) => sendJob(savepoint, STANDARD, { n: 41, ...envelope }))
    })
    const jobs = await worker!.fetch<{ n: number }>(STANDARD, { batchSize: 10 })
    assert.deepEqual(
      jobs.map((job) => job.data.n),
      [41]
    )
    await worker!.complete(
      STANDARD,
      jobs.map((job) => job.id)
    )
  })

  test('5. the runtime role works without DDL, the worker included', async ({ assert }) => {
    // The options that keep pg-boss from running DDL (docs/07 §4.10).
    for (const role of ['web', 'worker'] as const) {
      const options = jobBossOptions(appDatabase(), role)
      assert.isFalse(options.migrate)
      assert.isFalse(options.createSchema)
      assert.isFalse(options.persistQueueStats)
      assert.isFalse(options.reindex)
    }

    // A handler runs through the worker's own fetch loop.
    const handled = new Promise<number>((resolve) => {
      void worker!.work<{ n: number }>(WORKED, { pollingIntervalSeconds: 0.5 }, async ([job]) => {
        resolve(job.data.n)
      })
    })
    await db.transaction((trx) => sendJob(trx, WORKED, { n: 5, ...envelope }))
    assert.equal(await handled, 5)
    await worker!.offWork(WORKED)

    // The worker's maintenance pass (expiry, retention, monitoring), run now
    // instead of after its first interval; an error it reports fails this test.
    await worker!.supervise()

    await assert.rejects(
      () => db.rawQuery(`CREATE TABLE ${JOB_SCHEMA}.t_arch_004_probe (id int)`),
      /permission denied/
    )
    const owner = await db.rawQuery(
      'SELECT nspowner::regrole::text AS owner FROM pg_namespace WHERE nspname = ?',
      [JOB_SCHEMA]
    )
    assert.equal(owner.rows[0].owner, 'dripnepal_migrator')
  }).timeout(15_000)

  test('6. stately queues: one queued and one running per key; standard queues take all', async ({
    assert,
  }) => {
    const send = (n: number, singletonKey?: string) =>
      db.transaction((trx) =>
        singletonKey
          ? sendJob(trx, STATELY, { n, ...envelope }, { singletonKey })
          : sendJob(trx, STANDARD, { n, ...envelope })
      )

    const first = await send(60, 'k1')
    assert.isString(first)
    // A sweeper re-send while the job is still queued is refused (docs/11 §8.5).
    assert.isNull(await send(61, 'k1'))
    // Another key is its own lane.
    assert.isString(await send(62, 'k2'))

    const [running] = await worker!.fetch(STATELY, { batchSize: 1 })
    assert.isDefined(running)
    const runningKey = running.id === first ? 'k1' : 'k2'
    // A successor is accepted while the job of the same key is running.
    assert.isString(await send(63, runningKey))
    assert.isNull(await send(64, runningKey))

    // A standard queue with no singletonKey keeps every job.
    assert.isString(await send(65))
    assert.isString(await send(66))

    await worker!.complete(STATELY, running.id)
    await boss!.deleteQueuedJobs(STATELY)
    await boss!.deleteQueuedJobs(STANDARD)
  })

  test('the schema step upgrades an older schema and waits for its commands', async ({
    assert,
  }) => {
    const migrator = db.connection(MIGRATOR_CONNECTION)
    const version = async () => {
      const result = await migrator.rawQuery(`SELECT version FROM ${JOB_SCHEMA}.version`)
      return Number(result.rows[0].version)
    }
    const current = await version()
    // Roll back one version, as the migrator; the current version queues
    // out-of-transaction index builds, so the upgrade must wait for them.
    await migrator.rawQuery(getRollbackPlans(JOB_SCHEMA))
    assert.equal(await version(), current - 1)

    const config = db.manager.get(MIGRATOR_CONNECTION)!.config.connection as Record<string, unknown>
    await installJobSchema({
      host: String(config.host),
      port: Number(config.port),
      user: String(config.user),
      password: String(config.password),
      database: String(config.database),
    })

    assert.equal(await version(), current)
    const open = await migrator.rawQuery(
      `SELECT count(*)::int AS n FROM ${JOB_SCHEMA}.bam WHERE status <> 'completed'`
    )
    assert.equal(open.rows[0].n, 0, 'no out-of-transaction command left behind')
    // The runtime instance still sends on the upgraded schema.
    assert.isString(await db.transaction((trx) => sendJob(trx, STANDARD, { n: 7, ...envelope })))
    await boss!.deleteQueuedJobs(STANDARD)
  }).timeout(60_000)

  test('the uuidv7() check of docs/04 §2.1', async ({ assert }) => {
    const result = await db.rawQuery(
      `SELECT uuidv7()::text AS id,
              current_setting('server_version_num')::int AS version,
              (SELECT n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE p.proname = 'uuidv7' ORDER BY n.nspname = 'pg_catalog' DESC LIMIT 1) AS home`
    )
    const row = result.rows[0]
    // Version 7 sits in the 13th hex digit.
    assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    // On PostgreSQL 18 (CI) it is the built-in; older local servers use a shim.
    if (row.version >= 180000) assert.equal(row.home, 'pg_catalog')
  })
})

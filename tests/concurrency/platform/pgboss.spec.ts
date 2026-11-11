import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import type { PgBoss } from 'pg-boss'
import { JOB_SCHEMA, createJobBoss, jobBossOptions, sendJob } from '#modules/platform/jobs'

/*
 * T-ARCH-004: the M0 spike of docs/03 §10.1, kept as a regression test
 * (ADR-0010). It runs in the concurrency suite, which commits for real, as
 * `dripnepal_app` against a `pgboss` schema that the test setup hook
 * installed as `dripnepal_migrator` (`node ace jobs:install`). It proves:
 * 1. a job sent in a transaction that rolls back is never visible;
 * 2. after commit the job is fetched and completed;
 * 3. the send uses the transaction's own connection, even at pool size 1;
 * 4. a send in a savepoint that rolls back is removed with it;
 * 5. instances started as the runtime role with migration off work without DDL;
 * 6. the queue policies of docs/03 §9 and docs/11 §8.5.
 * Its record also holds the uuidv7() check of docs/04 §2.1.
 */

declare module '#modules/platform/jobs' {
  interface JobPayloads {
    [queue: `t_arch_004.${string}`]: { n: number }
  }
}

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
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

async function storedJobs(queue: string) {
  const result = await db.rawQuery(
    `SELECT count(*)::int AS n FROM ${JOB_SCHEMA}.job WHERE name = ? AND state = 'created'`,
    [queue]
  )
  return result.rows[0].n as number
}

test.group('T-ARCH-004 pg-boss transactional send', (group) => {
  let boss: PgBoss
  let worker: PgBoss
  const standard = `t_arch_004.${RUN}.standard` as const
  const stately = `t_arch_004.${RUN}.stately` as const

  group.setup(async () => {
    // Point 5: both runtime instances start as dripnepal_app with migration off.
    boss = createJobBoss(appDatabase(), 'web')
    worker = createJobBoss(appDatabase(), 'worker')
    boss.on('error', () => {})
    worker.on('error', () => {})
    await boss.start()
    await worker.start()
    await boss.createQueue(standard, { policy: 'standard' })
    await boss.createQueue(stately, { policy: 'stately' })
    return async () => {
      await boss.deleteQueue(standard)
      await boss.deleteQueue(stately)
      await boss.stop({ graceful: false, close: true })
      await worker.stop({ graceful: false, close: true })
    }
  })

  test('1. a job sent in a transaction that rolls back is never visible', async ({ assert }) => {
    await assert.rejects(() =>
      db.transaction(async (trx) => {
        await sendJob(boss, trx, standard, { n: 1, ...envelope })
        throw new Error('roll back')
      })
    )
    assert.equal(await storedJobs(standard), 0)
    assert.lengthOf(await worker.fetch(standard), 0)
  })

  test('2. after commit the job is fetched and completed', async ({ assert }) => {
    const id = await db.transaction((trx) => sendJob(boss, trx, standard, { n: 2, ...envelope }))
    assert.isString(id)
    const [job] = await worker.fetch<{ n: number }>(standard)
    assert.equal(job.id, id)
    assert.equal(job.data.n, 2)
    await worker.complete(standard, job.id)
    const done = await worker.getJobById(standard, job.id)
    assert.equal(done?.state, 'completed')
  })

  test("3. the send uses the transaction's own connection, even at pool size 1", async ({
    assert,
  }) => {
    const base = db.manager.get('pg')!.config
    db.manager.add('t_arch_004_one', { ...base, pool: { min: 0, max: 1 } })
    try {
      const one = db.connection('t_arch_004_one')
      await one.transaction(async (trx) => {
        // A send on another pool connection would wait for this one forever.
        await sendJob(boss, trx, standard, { n: 3, ...envelope })
        const inside = await trx.rawQuery(
          `SELECT count(*)::int AS n FROM ${JOB_SCHEMA}.job WHERE name = ? AND state = 'created'`,
          [standard]
        )
        assert.equal(inside.rows[0].n, 1, 'the transaction sees its own job')
        assert.equal(await storedJobs(standard), 0, 'no one else does before commit')
      })
      assert.equal(await storedJobs(standard), 1)
    } finally {
      await db.manager.close('t_arch_004_one')
      db.manager.release('t_arch_004_one')
      await boss.deleteQueuedJobs(standard)
    }
  }).timeout(10_000)

  test('4. a send in a savepoint that rolls back is removed with it', async ({ assert }) => {
    await db.transaction(async (trx) => {
      await assert.rejects(() =>
        trx.transaction(async (savepoint) => {
          await sendJob(boss, savepoint, standard, { n: 40, ...envelope })
          throw new Error('roll back the savepoint')
        })
      )
      await trx.transaction((savepoint) =>
        sendJob(boss, savepoint, standard, { n: 41, ...envelope })
      )
    })
    const jobs = await worker.fetch<{ n: number }>(standard, { batchSize: 10 })
    assert.deepEqual(
      jobs.map((job) => job.data.n),
      [41]
    )
    await worker.complete(
      standard,
      jobs.map((job) => job.id)
    )
  })

  test('5. the runtime role has no DDL on the job schema', async ({ assert }) => {
    // Neither runtime instance may install or upgrade the schema (docs/07 §4.10).
    for (const role of ['web', 'worker'] as const) {
      const options = jobBossOptions(appDatabase(), role)
      assert.isFalse(options.migrate)
      assert.isFalse(options.createSchema)
    }
    // The instances above started and created queues, so pg-boss needed none.
    await assert.rejects(
      () => db.rawQuery(`CREATE TABLE ${JOB_SCHEMA}.t_arch_004_probe (id int)`),
      /permission denied/
    )
    const owner = await db.rawQuery(
      'SELECT nspowner::regrole::text AS owner FROM pg_namespace WHERE nspname = ?',
      [JOB_SCHEMA]
    )
    assert.equal(owner.rows[0].owner, 'dripnepal_migrator')
  })

  test('6. stately queues: one queued and one running per key; standard queues take all', async ({
    assert,
  }) => {
    const send = (n: number, singletonKey?: string) =>
      db.transaction((trx) =>
        sendJob(boss, trx, singletonKey ? stately : standard, { n, ...envelope }, { singletonKey })
      )

    const first = await send(60, 'k1')
    assert.isString(first)
    // A sweeper re-send while the job is still queued is refused (docs/11 §8.5).
    assert.isNull(await send(61, 'k1'))
    // Another key is its own lane.
    assert.isString(await send(62, 'k2'))

    const [running] = await worker.fetch(stately, { batchSize: 1 })
    assert.isDefined(running)
    const runningKey = running.id === first ? 'k1' : 'k2'
    // A successor is accepted while the job of the same key is running.
    const successor = await send(63, runningKey)
    assert.isString(successor)
    assert.isNull(await send(64, runningKey))

    // A standard queue with no singletonKey keeps every job.
    assert.isString(await send(65))
    assert.isString(await send(66))

    await worker.complete(stately, running.id)
    await boss.deleteQueuedJobs(stately)
    await boss.deleteQueuedJobs(standard)
  })

  test('the uuidv7() check of docs/04 §2.1', async ({ assert }) => {
    const result = await db.rawQuery('SELECT uuidv7()::text AS id')
    // Version 7 sits in the 13th hex digit.
    assert.match(
      result.rows[0].id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })
})

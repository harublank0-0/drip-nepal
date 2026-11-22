import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { PgBoss } from 'pg-boss'
import {
  JOB_SCHEMA,
  createJobBoss,
  deadLetterQueue,
  ensureQueues,
  jobDatabaseOf,
} from '#modules/platform/jobs'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import { MIGRATOR_CONNECTION } from '#tests/support/database'

/*
 * T-ARCH-004, the queue part of the schema step (docs/09 §2.3, docs/03 §9):
 * `jobs:install` creates the queues of `JOB_QUEUES` with the 03 §9
 * settings (the two `notifications.*` queues, which carry `token_enc`, are
 * checked here), and `ensureQueues` can run again over existing queues, also for
 * a queue that sets nothing but the defaults. The queues are written to
 * `pgboss.queue` for real, so the probe queues are deleted afterwards.
 */

const PROBE = 't_arch_004.queue_probe'

async function queueRow(name: string) {
  const result = await db.rawQuery(
    `SELECT retry_limit, retry_backoff, retention_seconds, deletion_seconds, dead_letter
       FROM ${JOB_SCHEMA}.queue WHERE name = ?`,
    [name]
  )
  return result.rows[0]
}

test.group('T-ARCH-004 the schema step creates the application queues', (group) => {
  let boss: PgBoss | undefined

  group.setup(async () => {
    // As the migrator, like `jobs:install`.
    const config = db.manager.get(MIGRATOR_CONNECTION)!.config as PostgreConfig
    boss = createJobBoss(jobDatabaseOf(config)!, 'web')
    await boss.start()
    return async () => {
      for (const name of [PROBE, deadLetterQueue(PROBE)]) {
        if (await boss!.getQueue(name)) await boss!.deleteQueue(name)
      }
      await boss!.stop({ graceful: false, close: true })
    }
  })

  test('T-ARCH-004 notifications.dispatch has the 03 §9 retries and the token retention', async ({
    assert,
  }) => {
    assert.deepEqual(await queueRow('notifications.dispatch'), {
      retry_limit: 5,
      retry_backoff: true,
      retention_seconds: 604_800,
      deletion_seconds: 86_400,
      dead_letter: 'dlq.notifications.dispatch',
    })
    const dlq = await queueRow('dlq.notifications.dispatch')
    assert.equal(dlq.retention_seconds, 604_800)
  })

  test('T-ARCH-004 notifications.send_email has the 03 §9 retries and the token retention', async ({
    assert,
  }) => {
    const result = await db.rawQuery(
      `SELECT retry_limit, retry_delay, retry_backoff, retry_delay_max, retention_seconds,
              deletion_seconds, dead_letter
         FROM ${JOB_SCHEMA}.queue WHERE name = ?`,
      ['notifications.send_email']
    )
    assert.deepEqual(result.rows[0], {
      retry_limit: 8,
      retry_delay: 60,
      retry_backoff: true,
      retry_delay_max: 3600,
      retention_seconds: 604_800,
      deletion_seconds: 86_400,
      dead_letter: 'dlq.notifications.send_email',
    })
    const dlq = await queueRow('dlq.notifications.send_email')
    assert.equal(dlq.retention_seconds, 604_800)
  })

  test('T-ARCH-004 ensureQueues runs twice over a queue with defaults only', async ({ assert }) => {
    await ensureQueues(boss!, { [PROBE]: {} })
    await ensureQueues(boss!, { [PROBE]: {} })

    const row = await queueRow(PROBE)
    assert.equal(row.dead_letter, deadLetterQueue(PROBE))
    assert.isDefined(await queueRow(deadLetterQueue(PROBE)))
  })

  test('T-ARCH-004 a changed setting reaches an existing queue on the next run', async ({
    assert,
  }) => {
    await ensureQueues(boss!, { [PROBE]: { retryLimit: 1 } })
    await ensureQueues(boss!, { [PROBE]: { retryLimit: 5 } })

    const row = await queueRow(PROBE)
    assert.equal(row.retry_limit, 5)
  })
})

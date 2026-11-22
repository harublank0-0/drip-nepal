import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import type { FindJobsOptions, PgBoss } from 'pg-boss'
import JobsRedrive, { REDRIVE_LIMIT_MAX, chooseBatch } from '../../../commands/jobs_redrive.js'
import {
  DEAD_LETTER_RULES,
  JOB_QUEUES,
  JOB_SCHEMA,
  createJobBoss,
  deadLetterQueue,
  ensureQueues,
  jobDatabaseOf,
} from '#modules/platform/jobs'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { useJobBoss } from '#tests/support/jobs'

/*
 * T-OPS-025: `node ace jobs:redrive` (docs/09 §9.7) applies each queue's
 * dead-letter rule of docs/11 §8.2 and nothing else:
 * - every queue of `JOB_QUEUES` has a rule in `DEAD_LETTER_RULES`;
 * - a name that is not the dead-letter queue of an application queue
 *   (`dlq.refunds.execute` included, until that queue joins with its
 *   job-by-job mode), a limit out of range or not a number, `--discard` on
 *   a queue that is redriven (with `--dry-run` too), a plain run on a queue
 *   that is discarded, and a dead-letter queue `jobs:install` has not
 *   created each exit 1 and change nothing;
 * - `--discard` deletes at most `--limit` dead letters, oldest first, and
 *   `--dry-run` deletes none;
 * - a scan whose next page lost its anchor row starts again from the oldest;
 * - the output never holds a payload value.
 * The redrive after a real outage is T-NOT-001
 * (tests/concurrency/notifications/email_outage.spec.ts). The probe dead
 * letters here are sent straight to the dead-letter queues and committed,
 * so the command's own pg-boss instance sees them; each test deletes them.
 */

const REDRIVEN = 'dlq.notifications.send_email'
const DISCARDED = 'dlq.orders.book_courier_shipment'
const PROBE = 't_ops_025'

// The numbers of the probe dead letters left in `queue`, oldest first.
async function probes(queue: string) {
  const result = await db.rawQuery(
    `SELECT (data->>'n')::int AS n FROM ${JOB_SCHEMA}.job
      WHERE name = ? AND data->>'probe' = ? ORDER BY created_on, id`,
    [queue, PROBE]
  )
  return result.rows.map((row: { n: number }) => row.n)
}

// Their job IDs, oldest first.
async function probeIds(queue: string) {
  const result = await db.rawQuery(
    `SELECT id FROM ${JOB_SCHEMA}.job WHERE name = ? AND data->>'probe' = ? ORDER BY created_on, id`,
    [queue, PROBE]
  )
  return result.rows.map((row: { id: string }) => row.id)
}

async function park(boss: PgBoss, queue: string, n: number, secret: string) {
  const id = await boss.send(queue, { probe: PROBE, n, secret })
  if (!id) throw new Error(`${queue} refused the probe`)
}

async function redrive(argv: string[]) {
  const ace = await app.container.make('ace')
  ace.ui.switchMode('raw')
  const command = await ace.create(JobsRedrive, argv)
  await command.exec()
  return command
}

const output = (command: JobsRedrive) =>
  command.logger
    .getLogs()
    .map((log) => log.message)
    .join('\n')

async function cleanUp() {
  await db.rawQuery(`DELETE FROM ${JOB_SCHEMA}.job WHERE data->>'probe' = ?`, [PROBE])
}

test.group('T-OPS-025 jobs:redrive applies the dead-letter rule of each queue', (group) => {
  let boss: PgBoss
  group.setup(async () => {
    boss = await useJobBoss()
  })
  group.each.setup(async () => {
    await cleanUp()
    return cleanUp
  })

  test('T-OPS-025 every queue of JOB_QUEUES has a dead-letter rule', ({ assert }) => {
    assert.sameMembers(Object.keys(DEAD_LETTER_RULES), Object.keys(JOB_QUEUES))
  })

  test('T-OPS-025 {label} exits 1 and changes nothing')
    .with([
      {
        label: 'a queue that is not a dead-letter queue',
        argv: ['notifications.send_email'],
        message: 'is not the dead-letter queue of an application queue',
      },
      {
        label: 'the dead-letter queue of no application queue',
        argv: ['dlq.t_ops_025.none'],
        message: 'is not the dead-letter queue of an application queue',
      },
      {
        label: 'dlq.refunds.execute, before its job-by-job mode',
        argv: ['dlq.refunds.execute'],
        message: 'is not the dead-letter queue of an application queue',
      },
      {
        label: '--discard on a queue that is redriven',
        argv: [REDRIVEN, '--discard'],
        message: 'is redriven after the fix, never discarded',
      },
      {
        label: 'a dry run of --discard on a queue that is redriven',
        argv: [REDRIVEN, '--discard', '--dry-run'],
        message: 'is redriven after the fix, never discarded',
      },
      {
        label: 'a redrive of a queue that is discarded',
        argv: [DISCARDED],
        message: 'run it with --discard',
      },
      {
        label: 'a limit of 0',
        argv: [DISCARDED, '--discard', '--limit=0'],
        message: `--limit must be a whole number from 1 to ${REDRIVE_LIMIT_MAX}`,
      },
      {
        label: 'a limit above the batch maximum',
        argv: [DISCARDED, '--discard', `--limit=${REDRIVE_LIMIT_MAX + 1}`],
        message: `--limit must be a whole number from 1 to ${REDRIVE_LIMIT_MAX}`,
      },
    ])
    .run(async ({ assert }, { argv, message }) => {
      await park(boss, REDRIVEN, 1, 'kept')
      await park(boss, DISCARDED, 1, 'kept')

      const command = await redrive(argv)

      command.assertFailed()
      assert.include(output(command), message)
      assert.deepEqual(await probes(REDRIVEN), [1])
      assert.deepEqual(await probes(DISCARDED), [1])
    })

  test('T-OPS-025 a --limit that is not a number is refused before the command runs', async ({
    assert,
  }) => {
    await park(boss, DISCARDED, 1, 'kept')
    const ace = await app.container.make('ace')
    await assert.rejects(
      () => ace.create(JobsRedrive, [DISCARDED, '--discard', '--limit=many']),
      /numeric/
    )
    assert.deepEqual(await probes(DISCARDED), [1])
  })

  test('T-OPS-025 a dead-letter queue that jobs:install has not created exits 1', async ({
    assert,
  }) => {
    // A schedule queue: no test sends to it, so no job names its dead-letter queue.
    const source = 'orders.poll_courier_statuses'
    const dlq = deadLetterQueue(source)
    // As the migrator, which owns the queues; a killed run is repaired by the next jobs:install.
    const config = db.manager.get(MIGRATOR_CONNECTION)!.config as PostgreConfig
    const migrator = createJobBoss(jobDatabaseOf(config)!, 'web')
    await migrator.start()
    try {
      await migrator.updateQueue(source, { deadLetter: null })
      await migrator.deleteQueue(dlq)

      const command = await redrive([dlq, '--discard'])

      command.assertFailed()
      assert.include(output(command), `${dlq} does not exist; run node ace jobs:install`)
    } finally {
      // The step jobs:install runs puts the dead-letter queue back.
      await ensureQueues(migrator, { [source]: JOB_QUEUES[source] })
      await migrator.stop({ graceful: false, close: true })
    }
    assert.isNotNull(await boss.getQueue(dlq))
  }).timeout(30_000)

  test('T-OPS-025 a page whose last dead letter is deleted meanwhile is scanned again from the oldest', async ({
    assert,
  }) => {
    for (const n of [1, 2, 3]) await park(boss, DISCARDED, n, 'kept')
    const [, second, third] = await probeIds(DISCARDED)
    // After the first page, a purge or another run deletes its last row before the next read.
    let purged = false
    async function findJobs<T>(name: string, options?: FindJobsOptions) {
      const page = await boss.findJobs<T>(name, options)
      if (!purged && page.length > 0) {
        purged = true
        await boss.deleteJob(name, page[page.length - 1].id)
      }
      return page
    }

    const batch = await chooseBatch({ findJobs }, DISCARDED, {
      limit: 10,
      skipExpired: false,
      now: new Date(),
      pageSize: 1,
    })

    assert.deepEqual(batch.ids, [second, third])
    assert.isFalse(batch.more)
  })

  test('T-OPS-025 --discard deletes at most --limit dead letters, oldest first; --dry-run deletes none', async ({
    assert,
  }) => {
    const secret = `t-ops-025-${randomUUID()}`
    for (const n of [1, 2, 3]) await park(boss, DISCARDED, n, secret)

    const preview = await redrive([DISCARDED, '--discard', '--dry-run'])
    preview.assertSucceeded()
    assert.include(output(preview), `${DISCARDED}: 3 to discard`)
    assert.include(output(preview), 'dry run, nothing changed')
    assert.deepEqual(await probes(DISCARDED), [1, 2, 3])

    const first = await redrive([DISCARDED, '--discard', '--limit=2'])
    first.assertSucceeded()
    assert.include(output(first), `${DISCARDED}: 2 discarded`)
    assert.include(output(first), 'more dead letters wait')
    assert.deepEqual(await probes(DISCARDED), [3])

    const second = await redrive([DISCARDED, '--discard'])
    second.assertSucceeded()
    assert.include(output(second), `${DISCARDED}: 1 discarded`)
    assert.deepEqual(await probes(DISCARDED), [])

    const empty = await redrive([DISCARDED, '--discard'])
    empty.assertSucceeded()
    assert.include(output(empty), `${DISCARDED}: nothing to discard`)

    const printed = [preview, first, second, empty].map(output).join('\n')
    assert.notInclude(printed, secret)
  }).timeout(30_000)
})

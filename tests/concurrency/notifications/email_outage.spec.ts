import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import type { PgBoss } from 'pg-boss'
import JobsRedrive from '../../../commands/jobs_redrive.js'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import {
  JOB_QUEUES,
  JOB_SCHEMA,
  createJobBoss,
  deadLetterQueue,
  ensureQueues,
  jobDatabaseOf,
  type JobEnvelope,
  type JobPayloads,
  type QueueName,
} from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'
import { JOB_HANDLERS, type JobAttempt } from '#start/jobs'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { captureEmails } from '#tests/support/email'
import { queued, useJobBoss } from '#tests/support/jobs'

/*
 * T-NOT-001, the dead-letter and redrive part (docs/05 §8.14, docs/11 §8.3,
 * docs/09 §9.7; M1 part 1c). The adapter part is in
 * tests/functional/platform/email_sender.spec.ts and the handler part in
 * tests/functional/notifications/token_emails.spec.ts.
 *
 * pg-boss runs for real here: tokens are issued by the real step action,
 * each queue is worked as `jobs:work` works it (the handler of
 * `JOB_HANDLERS`, then pg-boss's complete or fail), and the redrive is the
 * `jobs:redrive` command with its own pg-boss instance. Everything commits,
 * so the suite is `concurrency`, and each test deletes the users, tokens,
 * rows and jobs it made (docs/10 §3.3). As 05 §8.14 asks, the queue's retry
 * limit and delay are set low for the group (one retry, due at once), so
 * the jobs really reach `dlq.notifications.send_email`; the group puts the
 * 03 §9 settings back afterwards. A run killed inside the group leaves the
 * queue at `retryLimit: 1` until the next `node ace jobs:install`, which
 * the next test run's setup performs. The `EmailSender` port is the
 * capturing fake, failing retryably while the outage lasts.
 *
 * - With the outage, every job dead-letters and its row stays `queued`
 *   with its attempts and transport error. Once it is over, a preview
 *   changes nothing, the redrive moves the dead letters back in two
 *   batches, every `queued` row is sent exactly once, a row that became
 *   `failed` meanwhile is never sent, and the output holds no payload.
 * - A dead letter past its retention is not redriven, and a token email
 *   whose token expired while it waited is redriven but not sent: its row
 *   becomes `failed` (docs/07 §3.8 rules 2 and 4).
 */

type SendPayload = JobPayloads['notifications.send_email'] & JobEnvelope

const DISPATCH = 'notifications.dispatch'
const SEND = 'notifications.send_email'
const DEAD = deadLetterQueue(SEND)
const QUEUES = [DISPATCH, SEND, DEAD, deadLetterQueue(DISPATCH)]
const EMAIL_PREFIX = 't-not-001-'

/*
 * One pass of the worker over `queue` (commands/jobs_work.ts): fetches the
 * jobs that are due, runs the registered handler, and completes each job or
 * fails it with the error, as pg-boss's work loop does, so the queue's
 * settings decide between a retry and the dead-letter queue.
 */
async function workDue(boss: PgBoss, queue: QueueName) {
  const handler = JOB_HANDLERS[queue] as
    | ((payload: never, attempt: JobAttempt) => Promise<unknown>)
    | undefined
  if (!handler) throw new Error(`jobs:work has no handler for ${queue}`)
  const jobs = await boss.fetch<{ request_id?: string | null }>(queue, {
    batchSize: 50,
    includeMetadata: true,
  })
  for (const job of jobs) {
    try {
      await handler(job.data as never, {
        retryCount: job.retryCount,
        retryLimit: job.retryLimit,
        requestId: job.data.request_id ?? null,
      })
      await boss.complete(queue, job)
    } catch (error) {
      await boss.fail(queue, job, error as Error)
    }
  }
  return jobs.length
}

// Passes until nothing is due; with the group's settings a retry is due at once.
async function drain(boss: PgBoss, queue: QueueName) {
  for (let pass = 0; pass < 10; pass++) {
    const ran = await workDue(boss, queue)
    if (ran === 0) return
  }
  throw new Error(`${queue} still had due jobs after 10 passes`)
}

/*
 * `count` users, each with a password_reset token issued by the real step
 * action and dispatched by the worker: one `queued` row and one send job each.
 */
async function queuedEmails(boss: PgBoss, count: number) {
  const userIds: string[] = []
  for (let n = 0; n < count; n++) {
    const [user] = await db
      .table('users')
      .insert({
        email: `${EMAIL_PREFIX}${randomUUID()}@example.com`,
        full_name: 'Sita Shrestha',
        password_hash: 'x',
      })
      .returning('id')
    await withTx((trx) => issueUserToken(trx, user.id, 'password_reset'))
    userIds.push(user.id)
  }
  await drain(boss, DISPATCH)
  const made: { userId: string; deliveryId: string }[] = []
  for (const userId of userIds) {
    const row = await db
      .from('notification_deliveries')
      .where('recipient_user_id', userId)
      .firstOrFail()
    made.push({ userId, deliveryId: row.id })
  }
  return made
}

const delivery = (id: string) => db.from('notification_deliveries').where('id', id).firstOrFail()

async function sourcesOf(queue: string) {
  const result = await db.rawQuery(
    `SELECT DISTINCT source_name FROM ${JOB_SCHEMA}.job WHERE name = ? AND state = 'created'`,
    [queue]
  )
  return result.rows.map((row: { source_name: string | null }) => row.source_name)
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

/*
 * Deletes what the tests committed, as the migrator, which owns both
 * schemas, and any probe T-OPS-025 (tests/concurrency/platform/
 * jobs_redrive.spec.ts) left in these queues after a killed run.
 */
async function cleanUp() {
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    const pattern = `${EMAIL_PREFIX}%`
    await trx.rawQuery(
      `DELETE FROM ${JOB_SCHEMA}.job WHERE name = ANY(?::text[]) AND data->>'probe' = ?`,
      [QUEUES, 't_ops_025']
    )
    await trx.rawQuery(
      `DELETE FROM ${JOB_SCHEMA}.job WHERE name = ANY(?::text[])
          AND data->>'user_token_id' IN (
            SELECT t.id::text FROM user_tokens t JOIN users u ON u.id = t.user_id
             WHERE u.email LIKE ?)`,
      [QUEUES, pattern]
    )
    const testUsers = () => trx.from('users').where('email', 'like', pattern).select('id')
    await trx.from('notification_deliveries').whereIn('recipient_user_id', testUsers()).delete()
    await trx.from('user_tokens').whereIn('user_id', testUsers()).delete()
    await trx.from('users').where('email', 'like', pattern).delete()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

test.group('T-NOT-001 email outage: dead letters and the redrive', (group) => {
  let boss: PgBoss
  let emails: ReturnType<typeof captureEmails>

  group.setup(async () => {
    boss = await useJobBoss()
    // Queue settings are the migrator's to change, as `jobs:install` does.
    const config = db.manager.get(MIGRATOR_CONNECTION)!.config as PostgreConfig
    const migrator = createJobBoss(jobDatabaseOf(config)!, 'web')
    await migrator.start()
    const restore = async () => {
      try {
        await ensureQueues(migrator, { [SEND]: JOB_QUEUES[SEND] })
      } finally {
        await migrator.stop({ graceful: false, close: true })
      }
    }
    try {
      // 05 §8.14: two attempts per job, the retry due at once.
      await migrator.updateQueue(SEND, { retryLimit: 1, retryDelay: 0, retryBackoff: false })
    } catch (error) {
      await restore()
      throw error
    }
    return restore
  })

  group.each.setup(async () => {
    emails = captureEmails()
    await cleanUp()
    return async () => {
      emails.restore()
      await cleanUp()
    }
  })

  test('T-NOT-001 jobs that fail through an outage are dead-lettered with their rows queued; after the redrive each queued row is sent once and a failed row never', async ({
    assert,
  }) => {
    // The worker passes run every due job, so no other test may have left one.
    for (const queue of [DISPATCH, SEND, DEAD]) {
      assert.lengthOf(await queued(queue), 0, `${queue} starts empty`)
    }
    const [a, b, c] = await queuedEmails(boss, 3)

    // The outage: every send fails retryably, as the mail adapter's does while SMTP is down.
    emails.fake.failNext('retryable', { reason: 'ECONNECTION', times: 6 })
    await drain(boss, SEND)

    assert.lengthOf(emails.fake.sent, 0)
    assert.lengthOf(emails.fake.contexts, 6, 'two attempts per job')
    for (const email of [a, b, c]) {
      const row = await delivery(email.deliveryId)
      assert.include(row, { status: 'queued', attempts: 2, last_error: 'ECONNECTION' })
    }
    assert.lengthOf(await queued(SEND), 0, 'nothing is left to retry')
    const dead = await queued<SendPayload>(DEAD)
    assert.sameMembers(
      dead.map((job) => job.data.delivery_id),
      [a.deliveryId, b.deliveryId, c.deliveryId]
    )
    assert.deepEqual(await sourcesOf(DEAD), [SEND])

    // Meanwhile a permanent outcome made b `failed`, set here as that outcome would set it.
    await db
      .from('notification_deliveries')
      .where('id', b.deliveryId)
      .update({ status: 'failed', last_error: 'recipient_refused' })

    // The outage is over. The preview changes nothing.
    const preview = await redrive([DEAD, '--dry-run'])
    preview.assertSucceeded()
    assert.include(output(preview), `${DEAD}: 3 to redrive to ${SEND}`)
    assert.include(output(preview), 'dry run, nothing changed')
    assert.lengthOf(await queued(DEAD), 3)

    // Two batches, oldest first.
    const first = await redrive([DEAD, '--limit=2'])
    first.assertSucceeded()
    assert.include(output(first), `${DEAD}: 2 redriven to ${SEND}`)
    assert.include(output(first), 'more dead letters wait')
    assert.lengthOf(await queued(DEAD), 1)
    assert.lengthOf(await queued(SEND), 2)
    const second = await redrive([DEAD])
    second.assertSucceeded()
    assert.include(output(second), `${DEAD}: 1 redriven to ${SEND}`)
    assert.lengthOf(await queued(DEAD), 0)

    await drain(boss, SEND)

    assert.sameMembers(
      emails.fake.sent.map((message) => message.idempotencyKey),
      [a.deliveryId, c.deliveryId]
    )
    for (const email of [a, c]) {
      const row = await delivery(email.deliveryId)
      assert.include(row, { status: 'sent', attempts: 3 })
    }
    const failed = await delivery(b.deliveryId)
    assert.include(failed, { status: 'failed', attempts: 2, last_error: 'recipient_refused' })

    // Nothing is left: another redrive finds nothing, and no email goes out twice.
    const again = await redrive([DEAD])
    again.assertSucceeded()
    assert.include(output(again), `${DEAD}: nothing to redrive`)
    assert.equal(await workDue(boss, SEND), 0)
    assert.lengthOf(emails.fake.sent, 2)

    // The output names queues, counts and times, never a payload value.
    const printed = [preview, first, second, again].map(output).join('\n')
    for (const job of dead) {
      assert.notInclude(printed, job.data.token_enc)
      assert.notInclude(printed, job.data.delivery_id)
      assert.notInclude(printed, job.data.user_token_id)
    }
  }).timeout(60_000)

  test('T-NOT-001 a dead letter past its retention is not redriven, and a token that expired while its email waited is not sent', async ({
    assert,
  }) => {
    for (const queue of [DISPATCH, SEND, DEAD]) {
      assert.lengthOf(await queued(queue), 0, `${queue} starts empty`)
    }
    const [late, stale] = await queuedEmails(boss, 2)
    emails.fake.failNext('retryable', { reason: 'ECONNECTION', times: 4 })
    await drain(boss, SEND)
    assert.lengthOf(await queued(DEAD), 2)

    // late's dead letter has outlived the queue's retention; pg-boss's purge has not run yet.
    await db.rawQuery(
      `UPDATE ${JOB_SCHEMA}.job SET keep_until = now() - interval '1 minute'
        WHERE name = ? AND data->>'delivery_id' = ?`,
      [DEAD, late.deliveryId]
    )
    // stale's token expired while its email waited.
    await db
      .from('user_tokens')
      .where('user_id', stale.userId)
      .update({
        created_at: db.raw("now() - interval '2 hours'"),
        expires_at: db.raw("now() - interval '1 hour'"),
      })

    const preview = await redrive([DEAD, '--dry-run'])
    preview.assertSucceeded()
    assert.include(output(preview), `${DEAD}: 1 to redrive to ${SEND}`)
    assert.include(output(preview), '1 past their retention, not redriven')

    const run = await redrive([DEAD])
    run.assertSucceeded()
    assert.include(output(run), `${DEAD}: 1 redriven to ${SEND}`)
    assert.include(output(run), '1 past their retention, not redriven')
    const left = await queued<SendPayload>(DEAD)
    assert.deepEqual(
      left.map((job) => job.data.delivery_id),
      [late.deliveryId]
    )

    await drain(boss, SEND)

    // The expired token's row fails without a send; the expired dead letter stays put, its row queued.
    assert.lengthOf(emails.fake.sent, 0)
    const failed = await delivery(stale.deliveryId)
    assert.include(failed, { status: 'failed', last_error: 'ECONNECTION; token_not_usable' })
    const waiting = await delivery(late.deliveryId)
    assert.include(waiting, { status: 'queued', attempts: 2 })
  }).timeout(60_000)
})

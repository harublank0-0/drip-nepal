import { createHash, randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import { appUrl } from '#config/app'
import { hmacKeys } from '#config/crypto'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { keyedHash } from '#modules/platform/crypto/keyed_hash'
import type { JobEnvelope, JobPayloads } from '#modules/platform/jobs'
import { EmailNotSent } from '#modules/platform/ports/email_sender'
import { withTx } from '#modules/platform/tx'
import { dispatchNotification } from '#modules/notifications/jobs/dispatch'
import { sendEmail, type SendOutcome } from '#modules/notifications/jobs/send_email'
import { captureEmails } from '#tests/support/email'
import { queued, useJobBoss } from '#tests/support/jobs'
import { captureLogs } from '#tests/support/logs'
import { insertUser } from '#tests/support/schema_rows'

/*
 * The token emails of M1 part 1b (docs/03 §9, docs/04a §14.3, docs/05
 * §8.14, docs/07 §3.8). Tokens are issued by the real step action
 * `issueUserToken`, which queues `notifications.dispatch`; the handlers are
 * called directly with the queued payloads, and the `EmailSender` port is
 * the capturing fake, which, like the real adapter, throws if a handler
 * sends inside a transaction (T-ARCH-003).
 *
 * - T-NOT-101: an event dispatched three times gives one delivery row, one
 *   `notifications.send_email` job and one email; the job run twice sends
 *   once (compare-and-set on `queued`). Both token purposes, each with its
 *   template, subject and page. A replay after the token was used is a
 *   quiet duplicate; a send job whose row is done is quiet, and one whose
 *   row is missing warns (03 §10.4).
 * - T-NOT-001, the handler part (05 §8.14): a retryable failure keeps the
 *   row `queued` with `attempts` and `last_error`, so the retry or a
 *   redrive still sends it, and any other error is recorded by its name
 *   only; a permanent one, a replaced or expired token, a user suspended
 *   meanwhile, an address changed since dispatch, and a `token_enc` that no
 *   longer decrypts (07 §3.8 rule 4) make it `failed` with no send, keeping
 *   an earlier transport error in `last_error`; nothing sends a `failed`
 *   row again. The dead-letter and redrive part, with `jobs:redrive`, is
 *   in tests/concurrency/notifications/email_outage.spec.ts.
 */

type DispatchPayload = JobPayloads['notifications.dispatch'] & JobEnvelope
type SendPayload = JobPayloads['notifications.send_email'] & JobEnvelope

// A token issued by the real step action, and the dispatch job it queued.
async function issueToken(purpose: 'password_reset' | 'mfa_enrollment', userId?: string) {
  const owner = userId ?? (await insertUser())
  const token = await withTx((trx) => issueUserToken(trx, owner, purpose))
  const jobs = await queued<DispatchPayload>('notifications.dispatch')
  const job = jobs.find((queuedJob) => queuedJob.data.user_token_id === token.id)
  if (!job) throw new Error('issueUserToken queued no dispatch job')
  return { userId: owner, tokenId: token.id, event: job.data }
}

async function sendJobsOf(deliveryId: string) {
  const jobs = await queued<SendPayload>('notifications.send_email')
  return jobs.filter((job) => job.data.delivery_id === deliveryId).map((job) => job.data)
}

const deliveriesOf = (userId: string) =>
  db.from('notification_deliveries').where('recipient_user_id', userId)

const delivery = (id: string) => db.from('notification_deliveries').where('id', id).firstOrFail()

// Dispatches an event and returns the one send_email payload it queued.
async function dispatched(event: DispatchPayload) {
  const outcome = await dispatchNotification(event)
  if (outcome.kind !== 'queued') throw new Error(`dispatch gave ${outcome.kind}`)
  const jobs = await sendJobsOf(outcome.deliveryId)
  if (jobs.length !== 1) throw new Error(`dispatch queued ${jobs.length} send jobs`)
  return jobs[0]
}

// The one link of a plain-text part.
function linkIn(text: string) {
  const match = /https?:\/\/\S+/.exec(text)
  if (!match) throw new Error('no link in the text part')
  return new URL(match[0])
}

test.group('T-NOT-101 a replayed event gives one delivery row and one send', (group) => {
  let emails: ReturnType<typeof captureEmails>
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    emails = captureEmails()
    return () => emails.restore()
  })

  test(
    'T-NOT-101 a {purpose} token event dispatched three times gives one row, one job and one email'
  )
    .with([
      {
        purpose: 'password_reset' as const,
        template: 'identity.password_reset',
        subject: 'Set your DripNepal password',
        page: '/reset-password',
      },
      {
        purpose: 'mfa_enrollment' as const,
        template: 'identity.mfa_enrollment',
        subject: 'Set up two-step sign-in for DripNepal',
        page: '/mfa',
      },
    ])
    .run(async ({ assert }, { purpose, template, subject, page }) => {
      const { userId, tokenId, event } = await issueToken(purpose)

      const first = await dispatchNotification(event)
      const second = await dispatchNotification(event)
      const third = await dispatchNotification(event)
      assert.equal(first.kind, 'queued')
      assert.deepEqual([second.kind, third.kind], ['duplicate', 'duplicate'])

      const rows = await deliveriesOf(userId)
      assert.lengthOf(rows, 1)
      const [row] = rows
      assert.equal(row.dedupe_key, `${tokenId}:${template}:${userId}`)
      assert.include(row, { channel: 'email', template, status: 'queued', attempts: 0 })
      // Only the keyed hash of the address is stored (docs/04a §14.3).
      const user = await db.from('users').where('id', userId).firstOrFail()
      assert.deepEqual(row.to_address_hash, keyedHash(hmacKeys.notifyAddress.release(), user.email))

      const jobs = await sendJobsOf(row.id)
      assert.lengthOf(jobs, 1)
      assert.include(jobs[0], {
        event: 'user_token.issued',
        user_token_id: tokenId,
        token_enc: event.token_enc,
        causation_id: tokenId,
      })

      // The job delivered twice, then the event replayed once more: still one email.
      const sent = await sendEmail(jobs[0])
      const resent = await sendEmail(jobs[0])
      const late = await dispatchNotification(event)
      assert.equal(sent.kind, 'sent')
      assert.equal(resent.kind, 'not_queued')
      assert.equal(late.kind, 'duplicate')
      assert.lengthOf(emails.fake.sent, 1)
      assert.lengthOf(await deliveriesOf(userId), 1)
      const after = await delivery(row.id)
      assert.include(after, { status: 'sent', attempts: 1, provider_message_id: 'fake-1' })
      assert.instanceOf(after.sent_at, Date)

      const [message] = emails.fake.sent
      assert.equal(message.to, user.email)
      assert.equal(message.template, template)
      assert.equal(message.subject, subject)
      assert.equal(message.idempotencyKey, row.id)
      // The link is APP_URL, the token's page and the issued token itself.
      const link = linkIn(message.text)
      assert.equal(link.origin, new URL(appUrl).origin)
      assert.equal(link.pathname, page)
      const token = await db.from('user_tokens').where('id', tokenId).firstOrFail()
      assert.deepEqual(
        createHash('sha256')
          .update(link.searchParams.get('token') ?? '')
          .digest(),
        token.token_hash
      )
    })

  test('T-NOT-101 a replay after the token was used is a quiet duplicate', async ({ assert }) => {
    const { userId, tokenId, event } = await issueToken('password_reset')
    const payload = await dispatched(event)
    await sendEmail(payload)
    // The user follows the link: `resetPassword` consumes the token.
    await db
      .from('user_tokens')
      .where('id', tokenId)
      .update({ consumed_at: db.raw('now()') })

    const outcomes: string[] = []
    const lines = await captureLogs(async () => {
      const outcome = await dispatchNotification(event)
      outcomes.push(outcome.kind)
    })
    assert.deepEqual(outcomes, ['duplicate'])
    assert.isUndefined(lines.find((line) => line.fields.event === 'notifications.email_not_sent'))
    assert.lengthOf(await deliveriesOf(userId), 1)
    assert.lengthOf(emails.fake.sent, 1)
  })

  test('T-NOT-101 a send job whose row is done is quiet; one whose row is missing warns', async ({
    assert,
  }) => {
    const { event } = await issueToken('mfa_enrollment')
    const payload = await dispatched(event)
    await sendEmail(payload)
    const missingId = randomUUID()

    const outcomes: string[] = []
    const lines = await captureLogs(async () => {
      const done = await sendEmail(payload)
      const missing = await sendEmail({ ...payload, delivery_id: missingId })
      outcomes.push(done.kind, missing.kind)
    })
    assert.deepEqual(outcomes, ['not_queued', 'missing'])
    const warnings = lines.filter((line) => line.fields.event === 'notifications.email_not_sent')
    assert.lengthOf(warnings, 1)
    assert.include(warnings[0].fields, { delivery_id: missingId, reason: 'delivery_missing' })
    assert.lengthOf(emails.fake.sent, 1)
  })
})

test.group('T-NOT-001 notifications.send_email failures', (group) => {
  let emails: ReturnType<typeof captureEmails>
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    emails = captureEmails()
    return () => emails.restore()
  })

  test('T-NOT-001 a retryable failure keeps the row queued with attempts and last_error; the next try sends it', async ({
    assert,
  }) => {
    const { event } = await issueToken('password_reset')
    const payload = await dispatched(event)
    emails.fake.failNext('retryable', { reason: 'ECONNECTION' })

    // Rethrown, so pg-boss retries the job.
    await assert.rejects(() => sendEmail(payload), EmailNotSent)
    const waiting = await delivery(payload.delivery_id)
    assert.include(waiting, { status: 'queued', attempts: 1, last_error: 'ECONNECTION' })
    assert.isNull(waiting.sent_at)
    assert.lengthOf(emails.fake.sent, 0)

    // The retry, or a redrive after the last one, still matches the compare-and-set.
    const retried = await sendEmail(payload)
    assert.equal(retried.kind, 'sent')
    const sent = await delivery(payload.delivery_id)
    assert.include(sent, { status: 'sent', attempts: 2 })
    assert.lengthOf(emails.fake.sent, 1)
  })

  test('T-NOT-001 a permanent failure marks the row failed and completes the job; nothing sends it again', async ({
    assert,
  }) => {
    const { userId, event } = await issueToken('password_reset')
    const payload = await dispatched(event)
    emails.fake.failNext('permanent')

    const outcomes: SendOutcome[] = []
    const lines = await captureLogs(async () => {
      outcomes.push(await sendEmail(payload))
    })
    assert.deepEqual(outcomes, [{ kind: 'failed', reason: 'recipient_refused' }])
    const failed = await delivery(payload.delivery_id)
    assert.include(failed, { status: 'failed', attempts: 1, last_error: 'recipient_refused' })
    assert.isNull(failed.sent_at)

    // A redelivered or redriven job finds no `queued` row.
    const again = await sendEmail(payload)
    assert.equal(again.kind, 'not_queued')
    assert.lengthOf(emails.fake.sent, 0)
    assert.lengthOf(emails.fake.contexts, 1)

    // The warning names the delivery, never the address or its hash (docs/09 §7.2).
    const warning = lines.find((line) => line.fields.event === 'notifications.email_not_sent')
    assert.isDefined(warning)
    assert.include(warning!.fields, {
      delivery_id: payload.delivery_id,
      reason: 'recipient_refused',
    })
    const user = await db.from('users').where('id', userId).firstOrFail()
    const logged = JSON.stringify(lines)
    assert.notInclude(logged, user.email)
    assert.notInclude(
      logged,
      keyedHash(hmacKeys.notifyAddress.release(), user.email).toString('hex')
    )
  })

  test('T-NOT-001 a token replaced before the send fails the row without sending', async ({
    assert,
  }) => {
    const { userId, event } = await issueToken('password_reset')
    const payload = await dispatched(event)
    // A newer reset token consumes the first: at most one live token per purpose.
    await issueToken('password_reset', userId)

    const outcome = await sendEmail(payload)
    assert.deepEqual(outcome, { kind: 'failed', reason: 'token_not_usable' })
    const failed = await delivery(payload.delivery_id)
    assert.include(failed, { status: 'failed', last_error: 'token_not_usable' })
    assert.lengthOf(emails.fake.sent, 0)
  })

  test('T-NOT-001 an event whose token was already replaced dispatches nothing', async ({
    assert,
  }) => {
    const first = await issueToken('mfa_enrollment')
    const second = await issueToken('mfa_enrollment', first.userId)

    const stale = await dispatchNotification(first.event)
    assert.deepEqual(stale, { kind: 'dropped', reason: 'token_not_usable' })
    assert.lengthOf(await deliveriesOf(first.userId), 0)

    const current = await dispatchNotification(second.event)
    assert.equal(current.kind, 'queued')
    const rows = await deliveriesOf(first.userId)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].dedupe_key, `${second.tokenId}:identity.mfa_enrollment:${first.userId}`)
  })

  test('T-NOT-001 a token_enc that no longer decrypts fails the row without sending', async ({
    assert,
  }) => {
    const { event } = await issueToken('password_reset')
    const payload = await dispatched(event)
    // A ciphertext the reset purpose cannot open, as after an exposure rotation
    // drops the key or once the token's expiry has passed: decrypt gives null.
    const unreadable = encryption.encrypt('not-the-token', {
      expiresIn: '1h',
      purpose: 'email_token:mfa_enrollment',
    })

    const outcome = await sendEmail({ ...payload, token_enc: unreadable })
    assert.deepEqual(outcome, { kind: 'failed', reason: 'token_undecryptable' })
    const failed = await delivery(payload.delivery_id)
    assert.include(failed, { status: 'failed', last_error: 'token_undecryptable' })
    assert.lengthOf(emails.fake.sent, 0)
  })

  test('T-NOT-001 a user suspended during an outage fails the row and keeps the transport error', async ({
    assert,
  }) => {
    const { userId, event } = await issueToken('password_reset')
    const payload = await dispatched(event)
    emails.fake.failNext('retryable', { reason: 'ECONNECTION' })
    await assert.rejects(() => sendEmail(payload), EmailNotSent)
    // The token stays live and unexpired; only the account's status changes (07 §3.8).
    await db.from('users').where('id', userId).update({ status: 'suspended' })

    const outcome = await sendEmail(payload)
    assert.deepEqual(outcome, { kind: 'failed', reason: 'token_not_usable' })
    const failed = await delivery(payload.delivery_id)
    assert.include(failed, {
      status: 'failed',
      attempts: 2,
      last_error: 'ECONNECTION; token_not_usable',
    })
    assert.lengthOf(emails.fake.sent, 0)
  })

  test('T-NOT-001 a token that expired before the send fails the row without sending', async ({
    assert,
  }) => {
    const { tokenId, event } = await issueToken('password_reset')
    const payload = await dispatched(event)
    await db
      .from('user_tokens')
      .where('id', tokenId)
      .update({
        created_at: db.raw("now() - interval '2 hours'"),
        expires_at: db.raw("now() - interval '1 hour'"),
      })

    const outcome = await sendEmail(payload)
    assert.deepEqual(outcome, { kind: 'failed', reason: 'token_not_usable' })
    const failed = await delivery(payload.delivery_id)
    assert.include(failed, { status: 'failed', last_error: 'token_not_usable' })
    assert.lengthOf(emails.fake.sent, 0)
  })

  test('T-NOT-001 an address changed since dispatch fails the row without sending', async ({
    assert,
  }) => {
    const { userId, event } = await issueToken('mfa_enrollment')
    const payload = await dispatched(event)
    // The row's hash is of the old address; the email must not go to another one.
    await db
      .from('users')
      .where('id', userId)
      .update({ email: `moved-${randomUUID()}@example.com` })

    const outcome = await sendEmail(payload)
    assert.deepEqual(outcome, { kind: 'failed', reason: 'address_changed' })
    const failed = await delivery(payload.delivery_id)
    assert.include(failed, { status: 'failed', last_error: 'address_changed' })
    assert.lengthOf(emails.fake.sent, 0)
  })

  test('T-NOT-001 an unexpected error is recorded by its name only, keeps the row queued and is rethrown', async ({
    assert,
  }) => {
    const { userId, event } = await issueToken('password_reset')
    const payload = await dispatched(event)
    const user = await db.from('users').where('id', userId).firstOrFail()
    emails.fake.throwNext(new TypeError(`cannot send to ${user.email}`))

    await assert.rejects(() => sendEmail(payload), TypeError)
    const waiting = await delivery(payload.delivery_id)
    assert.include(waiting, { status: 'queued', attempts: 1, last_error: 'TypeError' })
    assert.lengthOf(emails.fake.sent, 0)
  })
})

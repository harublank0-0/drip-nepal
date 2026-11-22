import { createHash, randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import { appUrl } from '#config/app'
import { hmacKeys } from '#config/crypto'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import {
  sendPasswordChangedEmail,
  sendSessionsRevokedEmail,
} from '#modules/identity/internal/password_effects'
import { signUp } from '#modules/identity/actions/sign_up'
import type { UserTokenPurpose } from '#modules/identity/domain/user_token_purpose'
import { keyedHash } from '#modules/platform/crypto/keyed_hash'
import type { JobEnvelope, JobPayloads } from '#modules/platform/jobs'
import { EmailNotSent } from '#modules/platform/ports/email_sender'
import { withTx } from '#modules/platform/tx'
import { dispatchNotification } from '#modules/notifications/jobs/dispatch'
import { sendEmail, type SendOutcome } from '#modules/notifications/jobs/send_email'
import { captureEmails } from '#tests/support/email'
import { queued, useJobBoss } from '#tests/support/jobs'
import { captureLogs } from '#tests/support/logs'
import { SIGN_UP_PASSWORD, forgetSignUp, randomIPv4 } from '#tests/support/identity'
import { insertUser } from '#tests/support/schema_rows'

/*
 * The token emails of M1 part 1b (docs/03 §9, docs/04a §14.3, docs/05
 * §8.14, docs/07 §3.8), and the email verification and "account already
 * exists" emails of M1 part 2a. Tokens are issued by the real step action
 * `issueUserToken`, and the account-exists event by the real `signUp`,
 * each of which queues `notifications.dispatch`; the handlers are called
 * directly with the queued payloads, and the `EmailSender` port is the
 * capturing fake, which, like the real adapter, throws if a handler sends
 * inside a transaction (T-ARCH-003).
 *
 * - T-NOT-101: an event dispatched three times gives one delivery row, one
 *   `notifications.send_email` job and one email; the job run twice sends
 *   once (compare-and-set on `queued`). Every token purpose, each with its
 *   template, subject and page, and the account-exists notice, whose link
 *   is the sign-in page and carries no token, and the "password changed"
 *   and "sessions revoked" notices of M1 part 4, whose link is the reset
 *   request page and carries no token. A replay after the token was
 *   used is a quiet duplicate; a send job whose row is done is quiet, and
 *   one whose row is missing warns (03 §10.4).
 * - T-NOT-001, the handler part (05 §8.14): a retryable failure keeps the
 *   row `queued` with `attempts` and `last_error`, so the retry or a
 *   redrive still sends it, and any other error is recorded by its name
 *   only; a permanent one, a replaced or expired token, a user suspended
 *   meanwhile, an address changed since dispatch, and a `token_enc` that no
 *   longer decrypts (07 §3.8 rule 4) make it `failed` with no send, keeping
 *   an earlier transport error in `last_error`, and so does an
 *   account-exists or "password changed" notice whose account was
 *   anonymised meanwhile; nothing
 *   sends a `failed` row again. The dead-letter and redrive part, with `jobs:redrive`, is
 *   in tests/concurrency/notifications/email_outage.spec.ts.
 */

type DispatchPayload = Extract<
  JobPayloads['notifications.dispatch'],
  { event: 'user_token.issued' }
> &
  JobEnvelope
type SendPayload = Extract<
  JobPayloads['notifications.send_email'],
  { event: 'user_token.issued' }
> &
  JobEnvelope
type NoticeDispatch = Extract<
  JobPayloads['notifications.dispatch'],
  { event: 'user.signup_attempted' | 'user.password_changed' | 'user.sessions_revoked' }
> &
  JobEnvelope
type AnySend = JobPayloads['notifications.send_email'] & JobEnvelope

// A token issued by the real step action, and the dispatch job it queued.
async function issueToken(purpose: UserTokenPurpose, userId?: string) {
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

/*
 * The "account already exists" event of a real `signUp`: the account is
 * created by a first sign-up and the event is queued by a second one with
 * the same email, from its own client network (tests/support/identity.ts).
 */
async function signupNotice() {
  const ip = randomIPv4()
  const email = `t-not-101-${randomUUID()}@example.com`
  const command = {
    email,
    password: SIGN_UP_PASSWORD,
    fullName: 'Sita Shrestha',
    phoneE164: null,
    marketingEmailConsent: false,
    marketingSmsConsent: false,
  }
  const context = { ip, requestId: null, ipHash: null }
  try {
    await signUp(command, context)
    await signUp(command, context)
  } finally {
    await forgetSignUp(ip)
  }
  const user = await db.from('users').where('email', email).firstOrFail()
  const jobs = await queued<NoticeDispatch>('notifications.dispatch')
  const job = jobs.find(
    (queuedJob) =>
      queuedJob.data.event === 'user.signup_attempted' && queuedJob.data.user_id === user.id
  )
  if (!job) throw new Error('signUp queued no account-exists event')
  return { userId: user.id as string, email, event: job.data }
}

/*
 * The "password changed" event, queued by the step that `resetPassword`
 * and `changePassword` call in their transactions, or the "sessions
 * revoked" event of `revokeAllSessions` and the `reauth` lockout (M1 part 4).
 */
async function passwordNotice(
  event: 'user.password_changed' | 'user.sessions_revoked' = 'user.password_changed'
) {
  const userId = await insertUser()
  await withTx((trx) =>
    event === 'user.password_changed'
      ? sendPasswordChangedEmail(trx, userId, null)
      : sendSessionsRevokedEmail(trx, userId, null)
  )
  const jobs = await queued<NoticeDispatch>('notifications.dispatch')
  const job = jobs.find(
    (queuedJob) => queuedJob.data.event === event && queuedJob.data.user_id === userId
  )
  if (!job) throw new Error(`no ${event} event was queued`)
  const user = await db.from('users').where('id', userId).firstOrFail()
  return { userId, email: user.email as string, event: job.data }
}

async function noticeSendJob(deliveryId: string) {
  const jobs = await queued<AnySend>('notifications.send_email')
  const job = jobs.find((queuedJob) => queuedJob.data.delivery_id === deliveryId)
  if (!job) throw new Error('dispatch queued no send job')
  return job.data
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
        purpose: 'email_verification' as const,
        template: 'identity.email_verification',
        subject: 'Confirm your email for DripNepal',
        page: '/verify-email',
      },
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

  test('T-NOT-101 an account-exists event dispatched three times gives one row, one job and one email with no token', async ({
    assert,
  }) => {
    const { userId, email, event } = await signupNotice()

    const first = await dispatchNotification(event)
    const second = await dispatchNotification(event)
    const third = await dispatchNotification(event)
    assert.equal(first.kind, 'queued')
    assert.deepEqual([second.kind, third.kind], ['duplicate', 'duplicate'])

    const rows = await deliveriesOf(userId)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].dedupe_key, `${event.event_id}:identity.account_exists:${userId}`)
    assert.include(rows[0], { template: 'identity.account_exists', status: 'queued' })
    assert.deepEqual(rows[0].to_address_hash, keyedHash(hmacKeys.notifyAddress.release(), email))

    const job = await noticeSendJob(rows[0].id)
    assert.include(job, {
      event: 'user.signup_attempted',
      event_id: event.event_id,
      user_id: userId,
      causation_id: event.event_id,
    })
    const sent = await sendEmail(job)
    const resent = await sendEmail(job)
    assert.equal(sent.kind, 'sent')
    assert.equal(resent.kind, 'not_queued')
    assert.lengthOf(emails.fake.sent, 1)
    const [message] = emails.fake.sent
    assert.equal(message.to, email)
    assert.equal(message.template, 'identity.account_exists')
    assert.equal(message.subject, 'Someone tried to sign up with your email')
    const link = linkIn(message.text)
    assert.equal(link.origin, new URL(appUrl).origin)
    assert.equal(link.pathname, '/login')
    assert.notInclude(message.text, 'token=')
  })

  test(
    'T-NOT-101 a {name} event dispatched three times gives one row, one job and one email linking the reset request page [AC-J18-06, AC-FR-NOT-001-1]'
  )
    .with([
      {
        name: 'password-changed',
        kind: 'user.password_changed' as const,
        template: 'identity.password_changed',
        subject: 'Your DripNepal password was changed',
      },
      {
        name: 'sessions-revoked',
        kind: 'user.sessions_revoked' as const,
        template: 'identity.sessions_revoked',
        subject: 'Your DripNepal account was signed out on your devices',
      },
    ])
    .run(async ({ assert }, { kind, template, subject }) => {
      const { userId, email, event } = await passwordNotice(kind)

      const outcomes = [
        await dispatchNotification(event),
        await dispatchNotification(event),
        await dispatchNotification(event),
      ]
      assert.deepEqual(
        outcomes.map((outcome) => outcome.kind),
        ['queued', 'duplicate', 'duplicate']
      )
      const rows = await deliveriesOf(userId)
      assert.lengthOf(rows, 1)
      assert.equal(rows[0].dedupe_key, `${event.event_id}:${template}:${userId}`)
      assert.include(rows[0], { template, status: 'queued' })

      const job = await noticeSendJob(rows[0].id)
      assert.include(job, { event: kind, user_id: userId })
      const sent = await sendEmail(job)
      const resent = await sendEmail(job)
      assert.equal(sent.kind, 'sent')
      assert.equal(resent.kind, 'not_queued')
      assert.lengthOf(emails.fake.sent, 1)
      const [message] = emails.fake.sent
      assert.equal(message.to, email)
      assert.equal(message.template, template)
      assert.equal(message.subject, subject)
      const link = linkIn(message.text)
      assert.equal(link.origin, new URL(appUrl).origin)
      assert.equal(link.pathname, '/forgot-password')
      assert.notInclude(message.text, 'token=')
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

  test('T-NOT-001 an account-exists notice whose account was anonymised before the send fails without sending', async ({
    assert,
  }) => {
    const { userId, event } = await signupNotice()
    const outcome = await dispatchNotification(event)
    if (outcome.kind !== 'queued') throw new Error(`dispatch gave ${outcome.kind}`)
    const job = await noticeSendJob(outcome.deliveryId)
    // The anonymisation of docs/04 §19.2, as M7's action will write it.
    await db
      .from('users')
      .where('id', userId)
      .update({
        status: 'anonymized',
        anonymized_at: db.raw('now()'),
        email: `deleted-${userId}@anonymized.invalid`,
        full_name: null,
        password_hash: null,
        age_confirmed_at: null,
      })

    const sent = await sendEmail(job)
    assert.deepEqual(sent, { kind: 'failed', reason: 'recipient_unreachable' })
    const failed = await delivery(outcome.deliveryId)
    assert.include(failed, { status: 'failed', last_error: 'recipient_unreachable' })
    assert.lengthOf(emails.fake.sent, 0)

    // A replay of the event after the anonymisation dispatches nothing new.
    const replay = await dispatchNotification(event)
    assert.equal(replay.kind, 'duplicate')
  })

  test('T-NOT-001 a password-changed notice whose account was anonymised before the send fails without sending', async ({
    assert,
  }) => {
    const { userId, event } = await passwordNotice()
    const outcome = await dispatchNotification(event)
    if (outcome.kind !== 'queued') throw new Error(`dispatch gave ${outcome.kind}`)
    const job = await noticeSendJob(outcome.deliveryId)
    await db
      .from('users')
      .where('id', userId)
      .update({
        status: 'anonymized',
        anonymized_at: db.raw('now()'),
        email: `deleted-${userId}@anonymized.invalid`,
        full_name: null,
        password_hash: null,
        age_confirmed_at: null,
      })

    const sent = await sendEmail(job)
    assert.deepEqual(sent, { kind: 'failed', reason: 'recipient_unreachable' })
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

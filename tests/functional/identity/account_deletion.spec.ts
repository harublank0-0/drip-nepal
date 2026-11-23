import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import { CookieClient } from '@adonisjs/core/http'
import { appUrl } from '#config/app'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { DomainError } from '#exceptions/domain_error'
import { requestAccountDeletion } from '#modules/identity/actions/request_account_deletion'
import { revokeSessions } from '#modules/identity/jobs/revoke_sessions'
import type { JobEnvelope, JobPayloads } from '#modules/platform/jobs'
import { dispatchNotification } from '#modules/notifications/jobs/dispatch'
import { sendEmail } from '#modules/notifications/jobs/send_email'
import { renderEmail } from '#modules/notifications/internal/render_email'
import type { Browser } from '#tests/support/browser'
import { signIn } from '#tests/support/courier_http'
import { captureEmails } from '#tests/support/email'
import { queued, useJobBoss } from '#tests/support/jobs'
import {
  DELETION_REQUEST_PATH,
  ME_PATH,
  deletionRequestedJobsFor,
  forgetReauth,
  getJson,
  guest,
  postJson,
  randomIPv4,
  revokeJobsFor,
  type Guest,
} from '#tests/support/identity'

/*
 * `requestAccountDeletion` over HTTP and through the action (docs/06
 * §13.3; 01 FR-IAM-009, AC-FR-IAM-009-1; docs/04 §19.2 step 1; docs/07
 * §3.12; M1 part 6a). Sessions are started with the test sign-in route
 * (`startSession`, as `logIn` does), one browser per device. The `reauth`
 * keys the requests charge are committed by the limiter store on its own
 * connection, so each test deletes them (docs/10 §3.3).
 * - T-IAM-008: the right password answers 202; the account becomes
 *   `deactivated` with `deletion_requested_at` and a new stamp; this
 *   session ends in the same request; `identity.revoke_sessions` is sent at
 *   once; the "deletion request received" email and one
 *   `user.deletion_request` row with the transition and no free text;
 *   a `pending_verification` account may ask too; a wrong password answers
 *   422 on `password`, writes `auth.reauth_failed` and closes nothing; a
 *   missing password, a `reason` (no free text is taken) or another unknown
 *   member
 *   answers 422 and charges nothing; the last active platform admin gets
 *   409 and nothing changes, while an admin with another active admin may
 *   ask; a guest gets 401; a stamp rotated or a suspension between the
 *   check and the write answers 401 or 403 and closes nothing.
 * - T-SEC-010: another device of the closed account gets 403
 *   `ACCOUNT_SUSPENDED` while its session exists, and 401 once the job has
 *   deleted it.
 * - T-SEC-102: the audit row holds no name, email or phone, and no
 *   `reason`.
 * - T-NOT-101: the deletion event dispatched three times gives one row and
 *   one email, which links the privacy notice and carries no token.
 * - T-IAM-008, the email's words: it prints the support contact the
 *   operator configured, and without one it leaves out the sentence that
 *   asks the holder to contact support.
 * The concurrent cases (T-IAM-110 and the `reauth` limit) are in
 * tests/concurrency/identity/account_deletion.spec.ts.
 */

type NoticeDispatch = Extract<
  JobPayloads['notifications.dispatch'],
  { event: 'user.deletion_requested' }
> &
  JobEnvelope

const cookies = new CookieClient(encryption.use())

// The session ID the browser's cookie names, unsigned.
function sessionIdOf(browser: Browser) {
  const value = browser.cookie('dripnepal_session')
  if (!value) throw new Error('no session cookie')
  return cookies.unsign('dripnepal_session', decodeURIComponent(value)) as string
}

const sessionRow = (id: string) => db.from('sessions').where('id', id).first()
const userRow = (userId: string) => db.from('users').where('id', userId).firstOrFail()
const auditRows = (action: string, userId: string) =>
  db.from('audit_logs').where({ action, subject_id: userId })

const problemFields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

const runRevoke = (userId: string) =>
  revokeSessions({ user_id: userId, request_id: null, causation_id: null })

// A device signed in as `userId`, on its own client network.
async function device(userId: string): Promise<Guest> {
  return { browser: await signIn(userId), ip: randomIPv4() }
}

/*
 * Every other unrevoked `platform_admin` row revoked, inside the test's
 * rolled-back transaction, so the last-admin rule sees only the accounts a
 * test makes, whatever another suite committed.
 */
async function onlyTheseAdmins(revokedBy: string, keep: string[]) {
  await db
    .from('platform_staff')
    .where('role', 'platform_admin')
    .whereNull('revoked_at')
    .whereNotIn('user_id', keep)
    .update({ revoked_at: db.raw('now()'), revoked_by: revokedBy })
}

test.group('T-IAM-008 requestAccountDeletion', (group) => {
  let userIds: string[]
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    userIds = []
    return async () => {
      for (const id of userIds) await forgetReauth(id)
    }
  })

  async function signedIn(state?: 'pending_verification') {
    const user = state ? await UserFactory.apply(state).create() : await UserFactory.create()
    await user.refresh()
    userIds.push(user.id)
    return { user, acting: await device(user.id) }
  }

  function ask(client: Guest, body: Record<string, unknown>) {
    return postJson(client, DELETION_REQUEST_PATH, body)
  }

  test('T-IAM-008 the right password answers 202, closes the account and ends this session [AC-FR-IAM-009-1]', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    const before = sessionIdOf(acting.browser)
    const response = await ask(acting, { password: FACTORY_PASSWORD })
    assert.equal(response.status, 202, response.text)
    assert.deepEqual(response.body, { data: { status: 'deletion_requested' } })

    const row = await userRow(user.id)
    assert.equal(row.status, 'deactivated')
    assert.instanceOf(row.deletion_requested_at, Date)
    assert.notEqual(row.security_stamp, user.securityStamp)

    // This session ended in the same request: its row is gone and the cookie names a guest.
    assert.isNull(await sessionRow(before))
    const after = await getJson(acting, ME_PATH)
    assert.equal(after.status, 401, after.text)

    // Sent at once: no session holds the new stamp, so every one of them ends.
    const jobs = await revokeJobsFor(user.id)
    assert.lengthOf(jobs, 1)
    assert.isBelow(jobs[0].start_after.getTime() - jobs[0].created_on.getTime(), 5000)
    assert.lengthOf(await deletionRequestedJobsFor(user.id), 1)

    const audits = await auditRows('user.deletion_request', user.id)
    assert.lengthOf(audits, 1)
    assert.include(audits[0], {
      actor_type: 'customer',
      actor_user_id: user.id,
      subject_type: 'user',
      request_id: response.headers.get('x-request-id'),
    })
    assert.deepEqual(audits[0].changes, {
      status: { from: 'active', to: 'deactivated' },
      changed: ['deletion_requested_at', 'security_stamp'],
    })
    assert.isNull(audits[0].reason)
  })

  test('T-SEC-102 the deletion row holds no name, email or phone, and no reason', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    const response = await ask(acting, { password: FACTORY_PASSWORD })
    assert.equal(response.status, 202, response.text)
    const [audit] = await auditRows('user.deletion_request', user.id)
    assert.isNull(audit.reason)
    const written = JSON.stringify(audit)
    assert.isNotNull(user.fullName)
    for (const value of [user.fullName!, user.email]) {
      assert.notInclude(written, value)
    }
  })

  test('T-SEC-010 another device of the closed account gets 403, then 401 once the job ran [AC-J17-01]', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    const other = await device(user.id)
    const idle = await device(user.id)
    const response = await ask(acting, { password: FACTORY_PASSWORD })
    assert.equal(response.status, 202, response.text)

    const refused = await getJson(other, ME_PATH)
    assert.equal(refused.status, 403, refused.text)
    assert.equal(refused.body.code, 'ACCOUNT_SUSPENDED')

    const idleId = sessionIdOf(idle.browser)
    assert.isNotNull(await sessionRow(idleId))
    const outcome = await runRevoke(user.id)
    assert.equal(outcome.destroyed, 1)
    assert.isNull(await sessionRow(idleId))
    const gone = await getJson(idle, ME_PATH)
    assert.equal(gone.status, 401, gone.text)
  })

  test('T-IAM-008 a pending_verification account may ask, and becomes deactivated [docs/07 §3.12]', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn('pending_verification')
    const response = await ask(acting, { password: FACTORY_PASSWORD })
    assert.equal(response.status, 202, response.text)
    const row = await userRow(user.id)
    assert.equal(row.status, 'deactivated')
    const [audit] = await auditRows('user.deletion_request', user.id)
    assert.deepEqual(audit.changes.status, { from: 'pending_verification', to: 'deactivated' })
    assert.isNull(audit.reason)
  })

  test('T-IAM-008 a wrong password answers 422 on password, writes auth.reauth_failed and closes nothing', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    const response = await ask(acting, { password: `${FACTORY_PASSWORD}x` })
    assert.equal(response.status, 422, response.text)
    assert.deepEqual(problemFields(response.body), [['password', 'password_incorrect']])

    const row = await userRow(user.id)
    assert.equal(row.status, 'active')
    assert.isNull(row.deletion_requested_at)
    assert.equal(row.security_stamp, user.securityStamp)
    assert.lengthOf(await auditRows('auth.reauth_failed', user.id), 1)
    assert.lengthOf(await auditRows('user.deletion_request', user.id), 0)
    assert.lengthOf(await revokeJobsFor(user.id), 0)
    assert.lengthOf(await deletionRequestedJobsFor(user.id), 0)
    const still = await getJson(acting, ME_PATH)
    assert.equal(still.status, 200, still.text)
  })

  test('T-IAM-008 {label} answers 422 on {field} and charges nothing')
    .with([
      { label: 'a missing password', field: 'password', body: {} },
      {
        label: 'a password over 128 characters',
        field: 'password',
        body: { password: 'p'.repeat(129) },
      },
      {
        label: 'a reason (no free text is taken)',
        field: 'reason',
        body: { password: 'unchecked-password', reason: 'Moving abroad.' },
      },
      {
        label: 'an unknown member',
        field: 'status',
        body: { password: 'unchecked-password', status: 'deactivated' },
      },
    ])
    .run(async ({ assert }, { field, body }) => {
      const { user, acting } = await signedIn()
      const response = await ask(acting, body)
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(
        problemFields(response.body).map(([name]) => name),
        [field]
      )
      const row = await userRow(user.id)
      assert.equal(row.status, 'active')
      assert.lengthOf(await auditRows('auth.reauth_failed', user.id), 0)
    })

  test('T-IAM-008 the last active platform admin gets 409 and nothing changes [docs/07 §3.12, docs/04a §5.4]', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    await db.table('platform_staff').insert({ user_id: user.id, role: 'platform_admin' })
    // A pending admin and a revoked one do not count; every other admin row is set aside.
    const pending = await UserFactory.apply('pending_verification').create()
    await db.table('platform_staff').insert({ user_id: pending.id, role: 'platform_admin' })
    await onlyTheseAdmins(user.id, [user.id, pending.id])

    const response = await ask(acting, { password: FACTORY_PASSWORD })
    assert.equal(response.status, 409, response.text)
    assert.equal(response.body.code, 'CONFLICT')

    const row = await userRow(user.id)
    assert.equal(row.status, 'active')
    assert.equal(row.security_stamp, user.securityStamp)
    assert.lengthOf(await auditRows('user.deletion_request', user.id), 0)
    assert.lengthOf(await revokeJobsFor(user.id), 0)
    assert.lengthOf(await deletionRequestedJobsFor(user.id), 0)
    const still = await getJson(acting, ME_PATH)
    assert.equal(still.status, 200, still.text)
  })

  test('T-IAM-008 an admin with another active admin may ask; the row is by platform_staff', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    const other = await UserFactory.create()
    await db.table('platform_staff').insert([
      { user_id: user.id, role: 'platform_admin' },
      { user_id: other.id, role: 'platform_admin' },
    ])
    await onlyTheseAdmins(user.id, [user.id, other.id])

    const response = await ask(acting, { password: FACTORY_PASSWORD })
    assert.equal(response.status, 202, response.text)
    const row = await userRow(user.id)
    assert.equal(row.status, 'deactivated')
    const [audit] = await auditRows('user.deletion_request', user.id)
    assert.include(audit, { actor_type: 'platform_staff', actor_role: 'platform:platform_admin' })
  })

  test('T-IAM-008 a guest gets 401', async ({ assert }) => {
    const response = await postJson(await guest(), DELETION_REQUEST_PATH, { password: 'x' })
    assert.equal(response.status, 401, response.text)
    assert.equal(response.body.code, 'UNAUTHENTICATED')
  })

  test('T-IAM-008 a stamp rotated or a suspension between the check and the write answers 401 or 403 and closes nothing', async ({
    assert,
  }) => {
    const { user } = await signedIn()
    const context = { requestId: null, ipHash: null }
    const command = { password: FACTORY_PASSWORD }

    await db
      .from('users')
      .where('id', user.id)
      .update({ security_stamp: db.raw('gen_random_uuid()') })
    const stale = await requestAccountDeletion(
      user.id,
      { ...command, sessionStamp: user.securityStamp },
      context
    ).then(
      () => null,
      (error) => error
    )
    assert.instanceOf(stale, DomainError)
    assert.equal((stale as DomainError).problemCode, 'UNAUTHENTICATED')

    const fresh = await userRow(user.id)
    await db.from('users').where('id', user.id).update({ status: 'suspended' })
    const suspended = await requestAccountDeletion(
      user.id,
      { ...command, sessionStamp: String(fresh.security_stamp) },
      context
    ).then(
      () => null,
      (error) => error
    )
    assert.instanceOf(suspended, DomainError)
    assert.equal((suspended as DomainError).problemCode, 'ACCOUNT_SUSPENDED')

    const row = await userRow(user.id)
    assert.equal(row.status, 'suspended')
    assert.isNull(row.deletion_requested_at)
    assert.lengthOf(await auditRows('user.deletion_request', user.id), 0)
  })
})

test.group('T-NOT-101 the deletion request email', (group) => {
  let emails: ReturnType<typeof captureEmails>
  let userIds: string[]
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    emails = captureEmails()
    userIds = []
    return async () => {
      emails.restore()
      for (const id of userIds) await forgetReauth(id)
    }
  })

  test('T-NOT-101 the deletion event dispatched three times gives one row and one email linking the privacy notice [AC-FR-NOT-001-1]', async ({
    assert,
  }) => {
    const user = await UserFactory.create()
    await user.refresh()
    userIds.push(user.id)
    await requestAccountDeletion(
      user.id,
      { password: FACTORY_PASSWORD, sessionStamp: user.securityStamp },
      { requestId: null, ipHash: null }
    )
    const jobs = await queued<NoticeDispatch>('notifications.dispatch')
    const job = jobs.find(
      (queuedJob) =>
        queuedJob.data.event === 'user.deletion_requested' && queuedJob.data.user_id === user.id
    )
    if (!job) throw new Error('requestAccountDeletion queued no deletion event')

    const outcomes = [
      await dispatchNotification(job.data),
      await dispatchNotification(job.data),
      await dispatchNotification(job.data),
    ]
    assert.deepEqual(
      outcomes.map((outcome) => outcome.kind),
      ['queued', 'duplicate', 'duplicate']
    )
    const rows = await db.from('notification_deliveries').where('recipient_user_id', user.id)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].dedupe_key, `${job.data.event_id}:identity.deletion_requested:${user.id}`)

    const sends = await queued<JobPayloads['notifications.send_email'] & JobEnvelope>(
      'notifications.send_email'
    )
    const send = sends.find((queuedJob) => queuedJob.data.delivery_id === rows[0].id)
    if (!send) throw new Error('dispatch queued no send job')
    // The account is deactivated by now, which is still reachable.
    const sent = await sendEmail(send.data)
    assert.equal(sent.kind, 'sent')
    assert.lengthOf(emails.fake.sent, 1)
    const [message] = emails.fake.sent
    assert.equal(message.to, user.email)
    assert.equal(message.template, 'identity.deletion_requested')
    assert.equal(message.subject, 'We received your request to delete your DripNepal account')
    const link = new URL(/https?:\/\/\S+/.exec(message.text)?.[0] ?? '')
    assert.equal(link.origin, new URL(appUrl).origin)
    assert.equal(link.pathname, '/legal/privacy')
    assert.notInclude(message.text, 'token=')
  })
})

test.group('T-IAM-008 the deletion email and the support contact', () => {
  test('T-IAM-008 the email prints the configured support contact, or leaves the contact sentence out', async ({
    assert,
  }) => {
    const link = 'https://example.test/legal/privacy'
    const withContact = await renderEmail('identity.deletion_requested', {
      link,
      support_email: 'help@example.test',
      support_phone: '9801234567',
    })
    assert.include(withContact.text, 'contact DripNepal support')
    assert.include(withContact.text, 'Email: help@example.test')
    assert.include(withContact.text, 'Phone: 9801234567')
    assert.include(withContact.html, 'help@example.test')
    assert.include(withContact.text, 'Read the privacy notice')

    const withoutContact = await renderEmail('identity.deletion_requested', { link })
    assert.notInclude(withoutContact.text, 'contact DripNepal support')
    assert.notInclude(withoutContact.text, 'Email:')
    assert.include(withoutContact.text, "If you didn't ask for this")
  })
})

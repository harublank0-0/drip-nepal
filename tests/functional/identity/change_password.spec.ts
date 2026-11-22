import { randomBytes } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import hash from '@adonisjs/core/services/hash'
import { CookieClient } from '@adonisjs/core/http'
import { MessageBuilder } from '@adonisjs/core/helpers'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { placeholderCiphertext } from '#database/factories/placeholder_ciphertext'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { revokeSessions } from '#modules/identity/jobs/revoke_sessions'
import { clientNetwork, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'
import type { Browser } from '#tests/support/browser'
import { signIn, statusOf } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import {
  CHANGE_PASSWORD_PATH,
  ME_PATH,
  REVOKE_ALL_PATH,
  forgetLogin,
  forgetReauth,
  getJson,
  guest,
  passwordChangedJobsFor,
  postJson,
  randomIPv4,
  revokeJobsFor,
  sessionsRevokedJobsFor,
  type Guest,
} from '#tests/support/identity'

/*
 * `changePassword`, `revokeAllSessions` and the `identity.revoke_sessions`
 * job over HTTP (docs/06 §13.3; 01 FR-IAM-005; 02 J-18 step 5; docs/07
 * §3.1, §3.3, §3.6, §3.8; M1 part 4). Sessions are started with the test
 * sign-in route (`startSession`, as `logIn` does), one browser per device.
 * - T-SEC-009: `changePassword` gives the acting session a new ID whose row
 *   is tagged and holds the new stamp; the old row is gone.
 * - T-IAM-006: a change answers 200; this device stays signed in and
 *   another device's next request is 401, and the job spares this one; the
 *   "password changed" email, one `auth.password_change` row, the live
 *   reset tokens consumed and an `mfa_enrollment` token kept while TOTP is
 *   not enrolled; a wrong current password answers 422, writes
 *   `auth.reauth_failed`, adds a `login_acct_ip` point and changes nothing;
 *   a new password out of range answers 422 without charging `reauth`; a
 *   stamp rotated or a suspension between the check and the write answers
 *   401 or 403 and keeps what that change wrote.
 * - T-IAM-109: `revokeAllSessions` answers 202, keeps this session's ID
 *   and gives it the new stamp; the job deletes every other tagged session
 *   of the user, an MFA-verified staff session included, and spares this
 *   one; the "sessions revoked" email is queued; a tagged row whose data
 *   does not verify is deleted; a second run deletes nothing.
 * - T-API-002: an extra member on either operation answers 422.
 * The `reauth` limits (T-SEC-011) are in
 * tests/concurrency/identity/password_reset.spec.ts.
 */

// One random password per run, never a literal (docs/09 §9.2).
const NEW_PASSWORD = randomBytes(12).toString('base64url')

const cookies = new CookieClient(encryption.use())

// The session ID the browser's cookie names, unsigned.
function sessionIdOf(browser: Browser) {
  const value = browser.cookie('dripnepal_session')
  if (!value) throw new Error('no session cookie')
  return cookies.unsign('dripnepal_session', decodeURIComponent(value)) as string
}

const sessionRow = (id: string) => db.from('sessions').where('id', id).first()

// The row's values, as the store wrote them.
function sessionData(row: { id: string; data: string }) {
  return new MessageBuilder().verify<Record<string, unknown>>(row.data, row.id) ?? {}
}

const userRow = (userId: string) => db.from('users').where('id', userId).firstOrFail()
const auditRows = (action: string, userId: string) =>
  db.from('audit_logs').where({ action, subject_id: userId })

const problemFields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

async function account() {
  const user = await UserFactory.create()
  // `security_stamp` comes from the column default.
  await user.refresh()
  return user
}

async function passwordVerifies(userId: string, password: string) {
  const row = await userRow(userId)
  return hash.use('scrypt').verify(row.password_hash, password)
}

// A device signed in as `userId`, on its own client network.
async function device(userId: string, mfaVerifiedAt?: string): Promise<Guest> {
  return { browser: await signIn(userId, mfaVerifiedAt), ip: randomIPv4() }
}

const runRevoke = (userId: string) =>
  revokeSessions({ user_id: userId, request_id: null, causation_id: null })

/*
 * Runs `change` inside changePassword's hash of the new password, after the
 * current password was checked and before the compare-and-set, as a request
 * that commits in that window would.
 */
async function duringNewHash<T>(change: () => Promise<unknown>, run: () => Promise<T>) {
  const scrypt = hash.use('scrypt')
  const make = scrypt.make
  scrypt.make = async function (this: typeof scrypt, value: string) {
    await change()
    return make.call(this, value)
  }
  try {
    return await run()
  } finally {
    Reflect.deleteProperty(scrypt, 'make')
  }
}

test.group('T-IAM-006 changePassword', (group) => {
  let users: { id: string; email: string; ips: string[] }[]
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    users = []
    return async () => {
      for (const user of users) {
        await forgetReauth(user.id)
        for (const ip of user.ips) await forgetLogin(user.email, ip)
      }
    }
  })

  async function signedIn() {
    const user = await account()
    const acting = await device(user.id)
    users.push({ id: user.id, email: user.email, ips: [acting.ip] })
    return { user, acting }
  }

  function change(client: Guest, body: Record<string, unknown>) {
    return postJson(client, CHANGE_PASSWORD_PATH, body)
  }

  test('T-SEC-009 changePassword gives this session a new ID, tags the new row and stores the new stamp', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    const before = sessionIdOf(acting.browser)
    const response = await change(acting, {
      current_password: FACTORY_PASSWORD,
      new_password: NEW_PASSWORD,
    })
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body, { data: { status: 'password_changed' } })

    const after = sessionIdOf(acting.browser)
    assert.notEqual(after, before)
    assert.isNull(await sessionRow(before))
    const row = await db.from('sessions').where('id', after).firstOrFail()
    assert.equal(row.user_id, user.id)
    const fresh = await userRow(user.id)
    assert.notEqual(fresh.security_stamp, user.securityStamp)
    assert.equal(sessionData(row).security_stamp, fresh.security_stamp)
  })

  test('T-IAM-006 this device stays signed in, the other device is refused, and the job spares this one [AC-FR-IAM-005-2, AC-J18-05]', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    const other = await device(user.id)
    const idle = await device(user.id)
    const response = await change(acting, {
      current_password: FACTORY_PASSWORD,
      new_password: NEW_PASSWORD,
    })
    assert.equal(response.status, 200, response.text)
    assert.isTrue(await passwordVerifies(user.id, NEW_PASSWORD))

    const mine = await getJson(acting, ME_PATH)
    assert.equal(mine.status, 200, mine.text)
    const theirs = await getJson(other, ME_PATH)
    assert.equal(theirs.status, 401, theirs.text)
    assert.equal(theirs.body.code, 'UNAUTHENTICATED')

    // Sent 10 s later, so this session has committed the new stamp first (07 §3.3).
    const [job] = await revokeJobsFor(user.id)
    const delay = job.start_after.getTime() - job.created_on.getTime()
    assert.isAtLeast(delay, 9000)
    const outcome = await runRevoke(user.id)
    assert.deepEqual(outcome, { destroyed: 1, kept: 1 })
    assert.isNull(await sessionRow(sessionIdOf(idle.browser)))
    assert.isNotNull(await sessionRow(sessionIdOf(acting.browser)))
    assert.equal(await statusOf(getJson(acting, ME_PATH)), 200)
  })

  test('T-IAM-006 the password changed email, one auth.password_change row, reset tokens consumed, an enrolment window kept [AC-FR-IAM-005-4, OD-60]', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    const reset = await withTx((trx) => issueUserToken(trx, user.id, 'password_reset'))
    const enrolment = await withTx((trx) => issueUserToken(trx, user.id, 'mfa_enrollment'))
    const response = await change(acting, {
      current_password: FACTORY_PASSWORD,
      new_password: NEW_PASSWORD,
    })
    assert.equal(response.status, 200, response.text)

    assert.lengthOf(await passwordChangedJobsFor(user.id), 1)
    const audits = await auditRows('auth.password_change', user.id)
    assert.lengthOf(audits, 1)
    assert.include(audits[0], {
      actor_type: 'customer',
      actor_user_id: user.id,
      request_id: response.headers.get('x-request-id'),
    })
    assert.deepEqual(audits[0].changes, { changed: ['password_hash', 'security_stamp'] })
    assert.notInclude(JSON.stringify(audits[0]), NEW_PASSWORD)

    const resetRow = await db.from('user_tokens').where('id', reset.id).firstOrFail()
    assert.instanceOf(resetRow.consumed_at, Date)
    const enrolmentRow = await db.from('user_tokens').where('id', enrolment.id).firstOrFail()
    assert.isNull(enrolmentRow.consumed_at)
  })

  test('T-IAM-006 with TOTP enrolled, a change also closes a live enrolment window [docs/07 §3.8]', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    await db
      .from('users')
      .where('id', user.id)
      .update({ mfa_enabled_at: db.raw('now()'), mfa_totp_secret_enc: placeholderCiphertext() })
    const enrolment = await withTx((trx) => issueUserToken(trx, user.id, 'mfa_enrollment'))
    const response = await change(acting, {
      current_password: FACTORY_PASSWORD,
      new_password: NEW_PASSWORD,
    })
    assert.equal(response.status, 200, response.text)
    const row = await db.from('user_tokens').where('id', enrolment.id).firstOrFail()
    assert.instanceOf(row.consumed_at, Date)
  })

  test('T-IAM-006 a wrong current password answers 422, writes auth.reauth_failed, counts toward the login limit and changes nothing [AC-FR-IAM-005-1]', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    const response = await change(acting, {
      current_password: `${FACTORY_PASSWORD}x`,
      new_password: NEW_PASSWORD,
    })
    assert.equal(response.status, 422, response.text)
    assert.deepEqual(problemFields(response.body), [['current_password', 'password_incorrect']])

    const fresh = await userRow(user.id)
    assert.equal(fresh.security_stamp, user.securityStamp)
    assert.isTrue(await passwordVerifies(user.id, FACTORY_PASSWORD))
    const failed = await auditRows('auth.reauth_failed', user.id)
    assert.lengthOf(failed, 1)
    assert.include(failed[0], { actor_type: 'customer', actor_user_id: user.id })
    assert.lengthOf(await auditRows('auth.password_change', user.id), 0)
    assert.lengthOf(await revokeJobsFor(user.id), 0)
    assert.lengthOf(await passwordChangedJobsFor(user.id), 0)

    // One point kept on each `reauth` key, and one on the caller's `login_acct_ip` key.
    const reauth = await rateLimiter('reauth_user').remaining(rateLimitKey('reauth_user', user.id))
    assert.equal(reauth, 4)
    const login = await rateLimiter('login_acct_ip').remaining(
      rateLimitKey('login_acct_ip', user.email, clientNetwork(acting.ip))
    )
    assert.equal(login, 4)
    // The session is untouched.
    assert.equal(await statusOf(getJson(acting, ME_PATH)), 200)
  })

  test('T-IAM-006 a new password out of range answers 422 on new_password without charging reauth', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    for (const newPassword of ['p'.repeat(9), 'p'.repeat(129)]) {
      const response = await change(acting, {
        current_password: FACTORY_PASSWORD,
        new_password: newPassword,
      })
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(
        problemFields(response.body).map(([field]) => field),
        ['new_password']
      )
    }
    const reauth = await rateLimiter('reauth_user').get(rateLimitKey('reauth_user', user.id))
    assert.isNull(reauth)
    assert.isTrue(await passwordVerifies(user.id, FACTORY_PASSWORD))
  })

  test('T-IAM-006 a guest gets 401 from changePassword and revokeAllSessions', async ({
    assert,
  }) => {
    const visitor = await guest()
    const changed = await change(visitor, {
      current_password: FACTORY_PASSWORD,
      new_password: NEW_PASSWORD,
    })
    assert.equal(changed.status, 401, changed.text)
    const revoked = await postJson(visitor, REVOKE_ALL_PATH, {})
    assert.equal(revoked.status, 401, revoked.text)
  })

  test(
    'T-IAM-006 a {name} between the check and the write answers {status} and keeps what that change wrote'
  )
    .with([
      { name: 'stamp rotation ("sign out everywhere")', status: 401, code: 'UNAUTHENTICATED' },
      { name: 'suspension', status: 403, code: 'ACCOUNT_SUSPENDED' },
    ])
    .run(async ({ assert }, { status, code }) => {
      const { user, acting } = await signedIn()
      const response = await duringNewHash(
        () =>
          db
            .from('users')
            .where('id', user.id)
            .update(
              status === 403
                ? { status: 'suspended' }
                : { security_stamp: db.raw('gen_random_uuid()') }
            ),
        () => change(acting, { current_password: FACTORY_PASSWORD, new_password: NEW_PASSWORD })
      )
      assert.equal(response.status, status, response.text)
      assert.equal(response.body.code, code)
      assert.isTrue(await passwordVerifies(user.id, FACTORY_PASSWORD))
      assert.lengthOf(await auditRows('auth.password_change', user.id), 0)
      assert.lengthOf(await revokeJobsFor(user.id), 0)
    })

  test('T-API-002 an extra member on changePassword or revokeAllSessions answers 422 unknown_field and changes nothing', async ({
    assert,
  }) => {
    const { user, acting } = await signedIn()
    const changed = await change(acting, {
      current_password: FACTORY_PASSWORD,
      new_password: NEW_PASSWORD,
      user_id: user.id,
    })
    assert.equal(changed.status, 422, changed.text)
    assert.deepEqual(problemFields(changed.body), [['user_id', 'unknown_field']])
    const revoked = await postJson(acting, REVOKE_ALL_PATH, { keep: 'this' })
    assert.equal(revoked.status, 422, revoked.text)
    assert.deepEqual(problemFields(revoked.body), [['keep', 'unknown_field']])
    const fresh = await userRow(user.id)
    assert.equal(fresh.security_stamp, user.securityStamp)
  })
})

test.group('T-IAM-109 revokeAllSessions and identity.revoke_sessions', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-IAM-109 revokeAllSessions keeps this session with the new stamp; the job deletes every other session and spares it [AC-FR-IAM-005-3]', async ({
    assert,
  }) => {
    const user = await account()
    const acting = await device(user.id)
    const others = [await device(user.id), await device(user.id)]
    const before = sessionIdOf(acting.browser)

    const response = await postJson(acting, REVOKE_ALL_PATH, {})
    assert.equal(response.status, 202, response.text)
    assert.deepEqual(response.body, { data: { status: 'sessions_revoked' } })

    // The same ID and tag, now with the new stamp (07 §3.3).
    assert.equal(sessionIdOf(acting.browser), before)
    const fresh = await userRow(user.id)
    assert.notEqual(fresh.security_stamp, user.securityStamp)
    const row = await db.from('sessions').where('id', before).firstOrFail()
    assert.equal(row.user_id, user.id)
    assert.equal(sessionData(row).security_stamp, fresh.security_stamp)

    const [job] = await revokeJobsFor(user.id)
    // The user ID only, never a session ID (07 §3.3).
    assert.deepEqual(job.data, {
      user_id: user.id,
      request_id: response.headers.get('x-request-id'),
      causation_id: null,
    })
    assert.isAtLeast(job.start_after.getTime() - job.created_on.getTime(), 9000)
    const audits = await auditRows('auth.sessions_revoke', user.id)
    assert.lengthOf(audits, 1)
    assert.deepEqual(audits[0].changes, { changed: ['security_stamp'] })
    // The "sessions revoked" email (01 AC-FR-NOT-001-1), in the same transaction.
    assert.lengthOf(await sessionsRevokedJobsFor(user.id), 1)

    const outcome = await runRevoke(user.id)
    assert.deepEqual(outcome, { destroyed: 2, kept: 1 })
    for (const other of others) {
      assert.isNull(await sessionRow(sessionIdOf(other.browser)))
      const me = await getJson(other, ME_PATH)
      assert.equal(me.status, 401, me.text)
    }
    assert.equal(await statusOf(getJson(acting, ME_PATH)), 200)
  })

  test('T-IAM-109 an MFA-verified staff session is revoked too', async ({ assert }) => {
    const user = await account()
    await db
      .from('users')
      .where('id', user.id)
      .update({ mfa_enabled_at: db.raw('now()'), mfa_totp_secret_enc: placeholderCiphertext() })
    await db.table('platform_staff').insert({ user_id: user.id, role: 'platform_admin' })
    const acting = await device(user.id)
    const admin = await device(user.id, new Date().toISOString())
    assert.equal(await statusOf(getJson(admin, '/api/v1/admin/logistics/accounts')), 200)

    assert.equal(await statusOf(postJson(acting, REVOKE_ALL_PATH, {})), 202)
    const [audit] = await auditRows('auth.sessions_revoke', user.id)
    assert.include(audit, { actor_type: 'platform_staff', actor_role: 'platform:platform_admin' })
    await runRevoke(user.id)
    assert.isNull(await sessionRow(sessionIdOf(admin.browser)))
    const refused = await getJson(admin, '/api/v1/admin/logistics/accounts')
    assert.equal(refused.status, 401, refused.text)
  })

  test('T-IAM-109 the job deletes a tagged row whose data does not verify', async ({ assert }) => {
    const user = await account()
    const kept = await device(user.id)
    await db.table('sessions').insert({
      id: `t-iam-109-${user.id}`,
      data: 'not-a-signed-message',
      user_id: user.id,
      expires_at: new Date(Date.now() + 3_600_000),
    })
    assert.deepEqual(await runRevoke(user.id), { destroyed: 1, kept: 1 })
    assert.isNull(await sessionRow(`t-iam-109-${user.id}`))
    assert.isNotNull(await sessionRow(sessionIdOf(kept.browser)))
  })

  test('T-IAM-109 the job is idempotent: a second run deletes nothing, and a user with no session is a no-op', async ({
    assert,
  }) => {
    const user = await account()
    const first = await device(user.id)
    await db
      .from('users')
      .where('id', user.id)
      .update({ security_stamp: db.raw('gen_random_uuid()') })
    assert.deepEqual(await runRevoke(user.id), { destroyed: 1, kept: 0 })
    assert.deepEqual(await runRevoke(user.id), { destroyed: 0, kept: 0 })
    assert.isNull(await sessionRow(sessionIdOf(first.browser)))

    const lonely = await account()
    assert.deepEqual(await runRevoke(lonely.id), { destroyed: 0, kept: 0 })
  })
})

import { randomBytes, randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { placeholderCiphertext } from '#database/factories/placeholder_ciphertext'
import { DomainError } from '#exceptions/domain_error'
import { toProblem } from '#exceptions/to_problem'
import { changePassword } from '#modules/identity/actions/change_password'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { resetPassword } from '#modules/identity/actions/reset_password'
import { revokeSessions } from '#modules/identity/jobs/revoke_sessions'
import { withTx } from '#modules/platform/tx'
import { signIn, statusOf } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import {
  CONFIRM_PATH,
  ME_PATH,
  PASSWORD_RESET_PATH,
  RESET_CONFIRM_PATH,
  forgetPasswordReset,
  forgetReauth,
  forgetResetToken,
  getJson,
  guest,
  liveToken,
  passwordChangedJobsFor,
  postJson,
  randomIPv4,
  rawTokenOf,
  revokeJobsFor,
  type Guest,
} from '#tests/support/identity'

/*
 * `requestPasswordReset` and `resetPassword` over HTTP (docs/06 §13.3; 01
 * FR-IAM-004; 02 J-18 steps 1–4; docs/07 §3.3, §3.8, TM-09; M1 part 4).
 * Every reset token is issued by the real `requestPasswordReset` and read
 * from the dispatch job its issuer queued.
 * - T-IAM-005: a known `active` or `pending_verification` account gets one
 *   live token and its email; a reset sets the password, rotates the
 *   stamp, consumes the token, queues `identity.revoke_sessions` and the
 *   "password changed" email, writes one `auth.password_reset` row, signs
 *   nobody in, and every session of the account is refused next; a
 *   pending account becomes `active`; a used, expired, unknown or replaced
 *   token, or one of a suspended account, answers 422 on `token` and
 *   changes nothing; a password out of range answers 422 and keeps the
 *   token; a live `mfa_enrollment` token survives while TOTP is not
 *   enrolled and is consumed once it is (OD-60).
 * - T-SEC-012: unknown, pending, active, suspended, deactivated and
 *   anonymised accounts get the same status and body, and only the first
 *   two a token; an `email_verification` token sent to `resetPassword`
 *   fails, stays unconsumed and still verifies the email.
 * - T-IAM-005, the race with a change: a reset whose token a committed
 *   `changePassword` consumed while the reset hashed answers 422 and keeps
 *   the changed password.
 * - T-SEC-010, the guest token routes (07 §3.3 row 3): a browser whose
 *   session went stale opens the reset link and gets the page as a guest,
 *   then resets with it; `confirmEmail` and `requestPasswordReset` from a
 *   stale session work as a guest's.
 * - T-API-002: an extra member on either operation answers 422.
 * The limiters and the races (T-IAM-105) are in
 * tests/concurrency/identity/password_reset.spec.ts.
 */

// Random passwords per run, never literals (docs/09 §9.2).
const NEW_PASSWORD = randomBytes(12).toString('base64url')
const CHANGED_PASSWORD = randomBytes(12).toString('base64url')

const userRow = (userId: string) => db.from('users').where('id', userId).firstOrFail()
const tokenRow = (tokenId: string) => db.from('user_tokens').where('id', tokenId).firstOrFail()
const resetAudits = (userId: string) =>
  db.from('audit_logs').where({ action: 'auth.password_reset', subject_id: userId })

const problemFields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

// The members of an answer that do not change from one request to the next.
const stable = (body: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(body).filter(([member]) => member !== 'request_id'))

async function account(state?: 'pending_verification' | 'suspended' | 'deactivated') {
  const user = state ? await UserFactory.apply(state).create() : await UserFactory.create()
  // `security_stamp` comes from the column default.
  await user.refresh()
  return user
}

async function anonymise(userId: string) {
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
}

async function passwordVerifies(userId: string, password: string) {
  const row = await userRow(userId)
  return row.password_hash ? hash.use('scrypt').verify(row.password_hash, password) : false
}

test.group('T-IAM-005 password reset', (group) => {
  let client: Guest
  let emails: string[]
  let tokens: string[]
  let changers: string[]
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(async () => {
    client = await guest()
    emails = []
    tokens = []
    changers = []
    return async () => {
      for (const email of emails) await forgetPasswordReset(email, client.ip)
      for (const token of tokens) await forgetResetToken(token)
      for (const userId of changers) {
        await forgetReauth(userId)
      }
    }
  })

  function requestReset(email: string, extra: Record<string, unknown> = {}) {
    emails.push(email)
    return postJson(client, PASSWORD_RESET_PATH, { email, ...extra })
  }

  // The live reset token of a user, as its email would carry it.
  async function resetLink(userId: string) {
    const live = await liveToken(userId, 'password_reset')
    if (!live) throw new Error('no live password_reset token')
    const token = await rawTokenOf(live.id, 'password_reset')
    tokens.push(token)
    return { id: live.id as string, token }
  }

  test('T-IAM-005 a known active account gets one live reset token and its email; nobody is signed in [AC-FR-IAM-004-1, AC-FR-IAM-004-2, 02 J-18 step 2]', async ({
    assert,
  }) => {
    const user = await account()
    const response = await requestReset(` ${user.email.toUpperCase()} `)
    assert.equal(response.status, 202, response.text)
    assert.deepEqual(response.body, { data: { status: 'reset_email_sent' } })

    const live = await liveToken(user.id, 'password_reset')
    assert.exists(live)
    // 60 minutes (07 §3.8), stored hashed.
    const lifetime = (live.expires_at.getTime() - live.created_at.getTime()) / 1000
    assert.equal(Math.round(lifetime), 3600)
    assert.lengthOf(live.token_hash, 32)
    const raw = await rawTokenOf(live.id, 'password_reset')
    assert.notInclude(JSON.stringify(live), raw)
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)
  })

  test('T-IAM-005 resetPassword sets the password, rotates the stamp, ends every session and signs nobody in [AC-FR-IAM-004-4, AC-J18-03, AC-J18-06]', async ({
    assert,
  }) => {
    const user = await account()
    // Two devices signed in before the reset.
    const phone: Guest = { browser: await signIn(user.id), ip: client.ip }
    const laptop: Guest = { browser: await signIn(user.id), ip: client.ip }
    assert.equal(await statusOf(requestReset(user.email)), 202)
    const link = await resetLink(user.id)

    const response = await postJson(client, RESET_CONFIRM_PATH, {
      token: link.token,
      password: NEW_PASSWORD,
    })
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body, { data: { status: 'password_reset' } })

    const fresh = await userRow(user.id)
    assert.notEqual(fresh.security_stamp, user.securityStamp)
    assert.isTrue(await passwordVerifies(user.id, NEW_PASSWORD))
    assert.isFalse(await passwordVerifies(user.id, FACTORY_PASSWORD))
    const token = await tokenRow(link.id)
    assert.instanceOf(token.consumed_at, Date)

    // The job and the email, both in the reset's transaction; the job at once, not delayed.
    const jobs = await revokeJobsFor(user.id)
    assert.lengthOf(jobs, 1)
    assert.isBelow(jobs[0].start_after.getTime() - jobs[0].created_on.getTime(), 5000)
    assert.lengthOf(await passwordChangedJobsFor(user.id), 1)

    const audits = await resetAudits(user.id)
    assert.lengthOf(audits, 1)
    assert.include(audits[0], { actor_type: 'customer', actor_user_id: user.id })
    assert.deepEqual(audits[0].changes, { changed: ['password_hash', 'security_stamp'] })
    for (const secret of [link.token, NEW_PASSWORD, fresh.password_hash]) {
      assert.notInclude(JSON.stringify(audits[0]), secret)
    }

    // Nobody is signed in by the reset: the guest's session holds no user.
    const me = await getJson(client, ME_PATH)
    assert.equal(me.status, 401, me.text)
    // The stamp check refuses the phone at once; the job deletes the laptop's row.
    const stale = await getJson(phone, ME_PATH)
    assert.equal(stale.status, 401, stale.text)
    await revokeSessions({ user_id: user.id, request_id: null, causation_id: null })
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)
    const gone = await getJson(laptop, ME_PATH)
    assert.equal(gone.status, 401, gone.text)
  })

  test('T-IAM-005 a pending_verification account becomes active with email_verified_at [02 J-18 step 3]', async ({
    assert,
  }) => {
    const user = await account('pending_verification')
    assert.equal(await statusOf(requestReset(user.email)), 202)
    const link = await resetLink(user.id)
    const response = await postJson(client, RESET_CONFIRM_PATH, {
      token: link.token,
      password: NEW_PASSWORD,
    })
    assert.equal(response.status, 200, response.text)
    const fresh = await userRow(user.id)
    assert.equal(fresh.status, 'active')
    assert.instanceOf(fresh.email_verified_at, Date)
    const [audit] = await resetAudits(user.id)
    assert.deepEqual(audit.changes, {
      changed: ['password_hash', 'security_stamp', 'email_verified_at'],
      status: { from: 'pending_verification', to: 'active' },
    })
  })

  test(
    'T-IAM-005 a {name} token is refused with 422 on token and the password is unchanged [AC-J18-02, AC-J18-04]'
  )
    .with([
      { name: 'used', kind: 'used' as const },
      { name: 'expired', kind: 'expired' as const },
      { name: 'unknown', kind: 'unknown' as const },
      { name: 'replaced', kind: 'replaced' as const },
      { name: "suspended account's", kind: 'suspended' as const },
    ])
    .run(async ({ assert }, { kind }) => {
      const user = await account()
      assert.equal(await statusOf(requestReset(user.email)), 202)
      const link = await resetLink(user.id)
      let token = link.token
      if (kind === 'used') {
        const first = await postJson(client, RESET_CONFIRM_PATH, { token, password: NEW_PASSWORD })
        assert.equal(first.status, 200, first.text)
      }
      if (kind === 'expired') {
        await db
          .from('user_tokens')
          .where('id', link.id)
          .update({
            created_at: db.raw("now() - interval '2 hours'"),
            expires_at: db.raw("now() - interval '1 hour'"),
          })
      }
      if (kind === 'unknown') token = randomBytes(32).toString('base64url')
      if (kind === 'replaced') {
        // Two reset emails: only the newest link works (AC-J18-04).
        assert.equal(await statusOf(requestReset(user.email)), 202)
      }
      if (kind === 'suspended') {
        await db.from('users').where('id', user.id).update({ status: 'suspended' })
      }
      const before = await userRow(user.id)

      const response = await postJson(client, RESET_CONFIRM_PATH, {
        token,
        password: `${NEW_PASSWORD}-again`,
      })
      assert.equal(response.status, 422, response.text)
      assert.equal(response.body.code, 'VALIDATION_FAILED')
      assert.deepEqual(problemFields(response.body), [['token', 'token_invalid']])

      const after = await userRow(user.id)
      assert.equal(after.password_hash, before.password_hash)
      assert.equal(after.security_stamp, before.security_stamp)
      assert.lengthOf(await resetAudits(user.id), kind === 'used' ? 1 : 0)
      if (kind === 'replaced') {
        const newest = await resetLink(user.id)
        const second = await postJson(client, RESET_CONFIRM_PATH, {
          token: newest.token,
          password: NEW_PASSWORD,
        })
        assert.equal(second.status, 200, second.text)
      }
    })

  test('T-IAM-005 a password out of range answers 422 on password and keeps the token [AC-FR-IAM-004-4]', async ({
    assert,
  }) => {
    const user = await account()
    assert.equal(await statusOf(requestReset(user.email)), 202)
    const link = await resetLink(user.id)
    for (const password of ['p'.repeat(9), 'p'.repeat(129)]) {
      const response = await postJson(client, RESET_CONFIRM_PATH, { token: link.token, password })
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(
        problemFields(response.body).map(([field]) => field),
        ['password']
      )
    }
    const token = await tokenRow(link.id)
    assert.isNull(token.consumed_at)
    assert.isTrue(await passwordVerifies(user.id, FACTORY_PASSWORD))
  })

  test('T-IAM-005 a live mfa_enrollment token survives a reset while TOTP is not enrolled, and is consumed once it is [OD-60, docs/07 §3.8]', async ({
    assert,
  }) => {
    const invitee = await account()
    const enrolled = await account()
    await db
      .from('users')
      .where('id', enrolled.id)
      .update({ mfa_enabled_at: db.raw('now()'), mfa_totp_secret_enc: placeholderCiphertext() })
    const windows = new Map<string, string>()
    for (const user of [invitee, enrolled]) {
      const issued = await withTx((trx) => issueUserToken(trx, user.id, 'mfa_enrollment'))
      windows.set(user.id, issued.id)
      assert.equal(await statusOf(requestReset(user.email)), 202)
      const link = await resetLink(user.id)
      const response = await postJson(client, RESET_CONFIRM_PATH, {
        token: link.token,
        password: NEW_PASSWORD,
      })
      assert.equal(response.status, 200, response.text)
    }
    const kept = await tokenRow(windows.get(invitee.id)!)
    assert.isNull(kept.consumed_at)
    const closed = await tokenRow(windows.get(enrolled.id)!)
    assert.instanceOf(closed.consumed_at, Date)
  })

  test('T-IAM-005 a reset whose token a committed changePassword consumed meanwhile answers 422 and keeps the changed password', async ({
    assert,
  }) => {
    const user = await account()
    changers.push(user.id)
    assert.equal(await statusOf(requestReset(user.email)), 202)
    const link = await resetLink(user.id)

    // The change commits while the reset hashes its new password, after its token lookup.
    const scrypt = hash.use('scrypt')
    const make = scrypt.make
    let changed = false
    scrypt.make = async function (this: typeof scrypt, value: string) {
      if (!changed) {
        changed = true
        await changePassword(
          user.id,
          {
            currentPassword: FACTORY_PASSWORD,
            newPassword: CHANGED_PASSWORD,
            sessionStamp: user.securityStamp,
          },
          { ip: client.ip, requestId: null, ipHash: null }
        )
      }
      return make.call(this, value)
    }
    let error: unknown = null
    try {
      error = await resetPassword(link.token, NEW_PASSWORD, { requestId: null, ipHash: null }).then(
        () => null,
        (refusal) => refusal
      )
    } finally {
      Reflect.deleteProperty(scrypt, 'make')
    }
    assert.isTrue(changed)
    assert.instanceOf(error, DomainError)
    const problem = toProblem(error, 'req-1')
    assert.deepEqual(
      problem.errors?.map((item) => [item.field, item.code]),
      [['token', 'token_invalid']]
    )
    assert.isTrue(await passwordVerifies(user.id, CHANGED_PASSWORD))
    assert.lengthOf(await resetAudits(user.id), 0)
    const changes = await db
      .from('audit_logs')
      .where({ action: 'auth.password_change', subject_id: user.id })
    assert.lengthOf(changes, 1)
  })

  test('T-API-002 an extra member on requestPasswordReset or resetPassword answers 422 unknown_field and changes nothing', async ({
    assert,
  }) => {
    const user = await account()
    const extra = await requestReset(user.email, { return_to: '/account' })
    assert.equal(extra.status, 422, extra.text)
    assert.deepEqual(problemFields(extra.body), [['return_to', 'unknown_field']])
    assert.isNull(await liveToken(user.id, 'password_reset'))

    assert.equal(await statusOf(requestReset(user.email)), 202)
    const link = await resetLink(user.id)
    const reset = await postJson(client, RESET_CONFIRM_PATH, {
      token: link.token,
      password: NEW_PASSWORD,
      email: user.email,
    })
    assert.equal(reset.status, 422, reset.text)
    assert.deepEqual(problemFields(reset.body), [['email', 'unknown_field']])
    const token = await tokenRow(link.id)
    assert.isNull(token.consumed_at)
  })
})

test.group('T-SEC-012 password reset enumeration and token purpose', (group) => {
  let client: Guest
  let emails: string[]
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(async () => {
    client = await guest()
    emails = []
    return async () => {
      for (const email of emails) await forgetPasswordReset(email, client.ip)
    }
  })

  test('T-SEC-012 unknown, pending, active, suspended, deactivated and anonymised accounts get the same answer; only the first two a token [AC-FR-IAM-004-1, AC-J18-01, 02 J-18 "Permission"]', async ({
    assert,
  }) => {
    const pending = await account('pending_verification')
    const active = await account()
    const suspended = await account('suspended')
    const deactivated = await account('deactivated')
    const anonymised = await account()
    await anonymise(anonymised.id)
    const cases = [
      { email: `t-sec-012-${randomUUID()}@example.com`, userId: null, token: false },
      { email: pending.email, userId: pending.id, token: true },
      { email: active.email, userId: active.id, token: true },
      { email: suspended.email, userId: suspended.id, token: false },
      { email: deactivated.email, userId: deactivated.id, token: false },
      { email: `deleted-${anonymised.id}@anonymized.invalid`, userId: anonymised.id, token: false },
    ]
    const bodies: Record<string, unknown>[] = []
    for (const item of cases) {
      emails.push(item.email)
      const response = await postJson(client, PASSWORD_RESET_PATH, { email: item.email })
      assert.equal(response.status, 202, response.text)
      bodies.push(stable(response.body))
      if (item.userId) {
        const live = await liveToken(item.userId, 'password_reset')
        assert.equal(live !== null, item.token, item.email)
      }
    }
    for (const body of bodies) assert.deepEqual(body, bodies[0])
    // Only the two eligible accounts' emails were queued.
    for (const item of cases.filter((entry) => entry.userId && !entry.token)) {
      const tokens = await db.from('user_tokens').where('user_id', item.userId!)
      assert.lengthOf(tokens, 0, item.email)
    }
  })

  test('T-SEC-012 an email_verification token sent to resetPassword fails, stays unconsumed and still verifies the email', async ({
    assert,
  }) => {
    const user = await account('pending_verification')
    const issued = await withTx((trx) => issueUserToken(trx, user.id, 'email_verification'))
    const token = await rawTokenOf(issued.id, 'email_verification')

    const reset = await postJson(client, RESET_CONFIRM_PATH, { token, password: NEW_PASSWORD })
    assert.equal(reset.status, 422, reset.text)
    assert.deepEqual(problemFields(reset.body), [['token', 'token_invalid']])
    const row = await tokenRow(issued.id)
    assert.isNull(row.consumed_at)
    assert.isTrue(await passwordVerifies(user.id, FACTORY_PASSWORD))

    const confirm = await postJson(client, CONFIRM_PATH, { token })
    assert.equal(confirm.status, 200, confirm.text)
    const fresh = await userRow(user.id)
    assert.equal(fresh.status, 'active')
  })
})

test.group('T-SEC-010 a stale session on the guest token routes', (group) => {
  let emails: string[]
  let tokens: string[]
  let ip: string
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    emails = []
    tokens = []
    ip = randomIPv4()
    return async () => {
      for (const email of emails) await forgetPasswordReset(email, ip)
      for (const token of tokens) await forgetResetToken(token)
    }
  })

  // A browser signed in as `userId` whose session then went stale (the password changed elsewhere).
  async function staleBrowser(userId: string): Promise<Guest> {
    const browser = await signIn(userId)
    await db
      .from('users')
      .where('id', userId)
      .update({ security_stamp: db.raw('gen_random_uuid()') })
    return { browser, ip }
  }

  test('T-SEC-010 the reset link opened in a stale session renders as a guest, with no redirect, and the reset then works [docs/07 §3.3 row 3]', async ({
    assert,
  }) => {
    const user = await account()
    emails.push(user.email)
    // The link is asked for elsewhere; the stale browser's first request is the link itself.
    const elsewhere = await guest(ip)
    assert.equal(
      await statusOf(postJson(elsewhere, PASSWORD_RESET_PATH, { email: user.email })),
      202
    )
    const stale = await staleBrowser(user.id)
    const live = await liveToken(user.id, 'password_reset')
    const token = await rawTokenOf(live.id, 'password_reset')
    tokens.push(token)

    const page = await stale.browser.request(`/reset-password?token=${encodeURIComponent(token)}`, {
      headers: { Accept: 'text/html' },
    })
    const html = await page.text()
    assert.equal(page.status, 200)
    assert.isNull(page.headers.get('location'))
    assert.equal(page.headers.get('cache-control'), 'no-store')
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
    assert.include(html, 'Set a new password')
    assert.notInclude(html, 'return_to')
    // The stale session was ended: no row of the user is left.
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)
    const unused = await db.from('user_tokens').where('id', live.id).firstOrFail()
    assert.isNull(unused.consumed_at)

    // The guest session kept its CSRF secret, so the page's form posts.
    const reset = await postJson(stale, RESET_CONFIRM_PATH, { token, password: NEW_PASSWORD })
    assert.equal(reset.status, 200, reset.text)
    assert.isTrue(await passwordVerifies(user.id, NEW_PASSWORD))
  })

  test("T-SEC-010 resetPassword, confirmEmail and requestPasswordReset from a stale session work as a guest's [docs/07 §3.3 row 3]", async ({
    assert,
  }) => {
    const resetter = await account()
    emails.push(resetter.email)
    const helper = await guest(ip)
    assert.equal(
      await statusOf(postJson(helper, PASSWORD_RESET_PATH, { email: resetter.email })),
      202
    )
    const live = await liveToken(resetter.id, 'password_reset')
    const token = await rawTokenOf(live.id, 'password_reset')
    tokens.push(token)
    const reset = await postJson(await staleBrowser(resetter.id), RESET_CONFIRM_PATH, {
      token,
      password: NEW_PASSWORD,
    })
    assert.equal(reset.status, 200, reset.text)

    const pending = await account('pending_verification')
    const issued = await withTx((trx) => issueUserToken(trx, pending.id, 'email_verification'))
    const verification = await rawTokenOf(issued.id, 'email_verification')
    const confirm = await postJson(await staleBrowser(pending.id), CONFIRM_PATH, {
      token: verification,
    })
    assert.equal(confirm.status, 200, confirm.text)

    const asker = await account()
    emails.push(asker.email)
    const request = await postJson(await staleBrowser(asker.id), PASSWORD_RESET_PATH, {
      email: asker.email,
    })
    assert.equal(request.status, 202, request.text)
    for (const user of [resetter, pending, asker]) {
      assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)
    }
  })
})

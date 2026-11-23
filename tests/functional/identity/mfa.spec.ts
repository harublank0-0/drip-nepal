import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import { CookieClient } from '@adonisjs/core/http'
import { MessageBuilder } from '@adonisjs/core/helpers'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import BootstrapPlatformAdmin from '#modules/identity/actions/bootstrap_platform_admin'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { totpStep } from '#modules/identity/domain/totp'
import { rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'
import type { Browser } from '#tests/support/browser'
import { minutesAgo, signIn, statusOf } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import { captureLogs } from '#tests/support/logs'
import {
  LOG_IN_PATH,
  MFA_CHALLENGE_PATH,
  ME_PATH,
  TOTP_CONFIRM_PATH,
  TOTP_START_PATH,
  codeAt,
  dispatchJobsFor,
  enrolledStaff,
  forgetLogin,
  forgetMfa,
  forgetReauth,
  getJson,
  guest,
  postJson,
  randomIPv4,
  rawTokenOf,
  staffWithoutTotp,
  wrongCode,
  type Guest,
} from '#tests/support/identity'

/*
 * Staff MFA over HTTP (docs/06 §13.3, §4.3; docs/07 §3.2, §3.4, §3.8,
 * §3.9; 01 FR-IAM-007; M1 part 5):
 * - T-SEC-008: after a grant, `startTotpEnrollment` is refused without a
 *   live `mfa_enrollment` token, with a token of another purpose, with
 *   another account's token (left unconsumed) and with a wrong password
 *   (counted by `reauth`); with the token and the password it returns the
 *   secret and the URI once and stores the secret sealed, and a second
 *   start replaces it; `confirmTotpEnrollment` with a valid code consumes
 *   the token, sets `mfa_enabled_at`, queues the email and raises
 *   `staff_privilege_change`, after which a start with the same token is
 *   refused and the same code cannot pass the challenge; a wrong code is
 *   422 on `code` with `auth.mfa_failed`; a non-staff caller gets 403 and
 *   charges nothing; staff without TOTP get `enrollment_required` from the
 *   admin API and the admin page sends them to `/mfa`; a valid code opens
 *   the admin API; an active non-staff user gets 404 from it, never 401,
 *   also hours after sign-in, and so does a `pending_verification` user
 *   with a staff row.
 * - T-SEC-009: the challenge gives the session a new ID whose row is
 *   tagged and holds `mfa_verified_at` as `{ user_id, at }` and
 *   `admin_seen_at`; past 2 hours of admin idle the proof is forgotten and
 *   the admin API asks for a new code; past the 7-day staff limit the
 *   session is ended with 401 `UNAUTHENTICATED`.
 * - T-SEC-017: `verifyMfaChallenge` keeps `return_to` only when it is a
 *   path on this site.
 * - T-SEC-102: the MFA audit rows hold no email, secret or code.
 * - T-API-002: an extra member on each operation is 422.
 * - T-OPS-019, the `/admin` enrolment gate of docs/09 §9.1: an admin made
 *   by `platform:create-admin` signs in, is sent to `/mfa`, cannot use the
 *   admin API, enrols with the emailed token and then opens it.
 * The limiter and race cases (T-SEC-011) are in
 * tests/concurrency/identity/mfa_throttle.spec.ts.
 */

const ADMIN_API = '/api/v1/admin/logistics/accounts'
const cookies = new CookieClient(encryption.use())

function sessionIdOf(browser: Browser) {
  const value = browser.cookie('dripnepal_session')
  if (!value) throw new Error('no session cookie')
  return cookies.unsign('dripnepal_session', decodeURIComponent(value)) as string
}

function sessionData(row: { id: string; data: string }) {
  return new MessageBuilder().verify<Record<string, unknown>>(row.data, row.id) ?? {}
}

const userRow = (userId: string) => db.from('users').where('id', userId).firstOrFail()

// One column of a user's row.
async function userColumn(userId: string, column: string) {
  const row = await userRow(userId)
  return row[column]
}

// When a token was consumed, or null.
async function consumedAt(tokenId: string) {
  const row = await db.from('user_tokens').where('id', tokenId).firstOrFail()
  return row.consumed_at as Date | null
}
const auditRows = (action: string, userId: string) =>
  db.from('audit_logs').where({ action, subject_id: userId })

const problemFields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

const hoursAgo = (hours: number) => minutesAgo(hours * 60)

// An `mfa_enrollment` (or other) token issued by the real step action, and its raw value.
async function tokenFor(userId: string, purpose: 'mfa_enrollment' | 'password_reset') {
  const issued = await withTx((trx) => issueUserToken(trx, userId, purpose))
  return { id: issued.id, raw: await rawTokenOf(issued.id, purpose) }
}

test.group('T-SEC-008 staff MFA', (group) => {
  // Every user and client network a test charged a limiter for, cleaned after it.
  let charged: { userId: string; email: string; ips: string[] }[]
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    charged = []
    return async () => {
      for (const { userId, email, ips } of charged) {
        await forgetMfa(userId, ...ips)
        await forgetReauth(userId)
        for (const ip of ips) await forgetLogin(email, ip)
      }
    }
  })

  // A device signed in as `user` (no MFA proof unless given), on its own client network.
  async function device(
    user: { id: string; email: string },
    mfaVerifiedAt?: string,
    times: { authenticatedAt?: string; adminSeenAt?: string } = {}
  ): Promise<Guest> {
    const ip = randomIPv4()
    charged.push({ userId: user.id, email: user.email, ips: [ip] })
    return { browser: await signIn(user.id, mfaVerifiedAt, times), ip }
  }

  async function started(client: Guest, token: string) {
    const response = await postJson(client, TOTP_START_PATH, { token, password: FACTORY_PASSWORD })
    if (response.status !== 200) throw new Error(`startTotpEnrollment answered ${response.text}`)
    return response.body.data as { secret: string; otpauth_uri: string }
  }

  test('T-SEC-008 after a grant, startTotpEnrollment is refused without a live token, with a token of another purpose or account, and with a wrong password', async ({
    assert,
  }) => {
    const staff = await staffWithoutTotp()
    const other = await staffWithoutTotp()
    const own = await tokenFor(staff.id, 'mfa_enrollment')
    const reset = await tokenFor(staff.id, 'password_reset')
    const othersToken = await tokenFor(other.id, 'mfa_enrollment')
    const client = await device(staff)

    for (const token of ['x'.repeat(43), reset.raw, othersToken.raw]) {
      const response = await postJson(client, TOTP_START_PATH, {
        token,
        password: FACTORY_PASSWORD,
      })
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [['token', 'token_invalid']])
    }
    // Neither token of another purpose or account was consumed (docs/07 §3.8).
    assert.isNull(await consumedAt(reset.id))
    assert.isNull(await consumedAt(othersToken.id))

    const wrong = await postJson(client, TOTP_START_PATH, { token: own.raw, password: 'not it' })
    assert.equal(wrong.status, 422, wrong.text)
    assert.deepEqual(problemFields(wrong.body), [['password', 'password_incorrect']])
    const point = await rateLimiter('reauth_user').get(rateLimitKey('reauth_user', staff.id))
    assert.equal(point?.consumed, 1)
    assert.lengthOf(await auditRows('auth.reauth_failed', staff.id), 1)

    const fresh = await userRow(staff.id)
    assert.isNull(fresh.mfa_totp_secret_enc)
    assert.isNull(fresh.mfa_enabled_at)
    assert.isNull(await consumedAt(own.id))
  })

  test('T-SEC-008 startTotpEnrollment with the live token and the password returns the secret and the URI once and stores the secret sealed; a second start replaces it', async ({
    assert,
  }) => {
    const staff = await staffWithoutTotp()
    const token = await tokenFor(staff.id, 'mfa_enrollment')
    const client = await device(staff)

    const response = await postJson(client, TOTP_START_PATH, {
      token: token.raw,
      password: FACTORY_PASSWORD,
    })
    assert.equal(response.status, 200, response.text)
    assert.include(response.headers.get('cache-control') ?? '', 'no-store')
    const first = response.body.data as { secret: string; otpauth_uri: string }
    assert.sameMembers(Object.keys(response.body.data), ['secret', 'otpauth_uri'])
    assert.match(first.secret, /^[A-Z2-7]{32}$/)
    assert.isTrue(
      first.otpauth_uri.startsWith(
        `otpauth://totp/DripNepal%20(test):${encodeURIComponent(staff.email)}?secret=${first.secret}&`
      ),
      first.otpauth_uri
    )

    const row = await userRow(staff.id)
    assert.match(row.mfa_totp_secret_enc, /^v1\./)
    assert.notInclude(row.mfa_totp_secret_enc, first.secret)
    assert.isNull(row.mfa_enabled_at)
    // Only confirmTotpEnrollment consumes the token.
    assert.isNull(await consumedAt(token.id))
    const [audit] = await auditRows('auth.mfa_enrollment_start', staff.id)
    assert.deepEqual(audit.changes, { changed: ['mfa_totp_secret_enc'] })

    const second = await started(client, token.raw)
    assert.notEqual(second.secret, first.secret)
    assert.notEqual(await userColumn(staff.id, 'mfa_totp_secret_enc'), row.mfa_totp_secret_enc)
    assert.lengthOf(await auditRows('auth.mfa_enrollment_start', staff.id), 2)
  })

  test('T-SEC-008 confirmTotpEnrollment with a valid code consumes the token, turns TOTP on, queues the email and raises staff_privilege_change; the token and the code are spent [AC-FR-IAM-007-1, AC-FR-IAM-007-3]', async ({
    assert,
  }) => {
    const staff = await staffWithoutTotp()
    const token = await tokenFor(staff.id, 'mfa_enrollment')
    const client = await device(staff)
    const { secret } = await started(client, token.raw)
    const code = codeAt(secret)

    const answers: Awaited<ReturnType<typeof postJson>>[] = []
    const lines = await captureLogs(async () => {
      answers.push(await postJson(client, TOTP_CONFIRM_PATH, { code, token: token.raw }))
    })
    const [confirmed] = answers
    assert.equal(confirmed.status, 200, confirmed.text)
    assert.deepEqual(confirmed.body, { data: { status: 'mfa_enabled' } })

    const row = await userRow(staff.id)
    assert.instanceOf(row.mfa_enabled_at, Date)
    assert.isAtLeast(row.mfa_last_used_step, totpStep(Date.now()) - 1)
    assert.instanceOf(await consumedAt(token.id), Date)
    const [audit] = await auditRows('platform_staff.mfa_enable', staff.id)
    assert.include(audit, { actor_type: 'platform_staff', actor_role: 'platform:platform_admin' })
    const jobs = await dispatchJobsFor(staff.id)
    const emails = jobs.filter((job) => job.data.event === 'user.mfa_enabled')
    assert.lengthOf(emails, 1)
    assert.include(emails[0].data as Record<string, unknown>, {
      user_id: staff.id,
      event_id: token.id,
    })
    const alerts = lines.filter((line) => line.fields.alert === 'staff_privilege_change')
    assert.lengthOf(alerts, 1)
    assert.equal(alerts[0].fields.user_id, staff.id)

    // The session holds no MFA proof yet: only the challenge writes one (docs/07 §3.2).
    const admin = await getJson(client, ADMIN_API)
    assert.equal(admin.status, 401, admin.text)
    assert.include(admin.body, { code: 'MFA_REQUIRED', mfa: 'verification_required' })

    // A start with the same token is refused now that TOTP is on.
    const again = await postJson(client, TOTP_START_PATH, {
      token: token.raw,
      password: FACTORY_PASSWORD,
    })
    assert.equal(again.status, 409, again.text)

    // The code that turned TOTP on cannot pass the challenge; the next one does.
    const replay = await postJson(client, MFA_CHALLENGE_PATH, { code })
    assert.equal(replay.status, 422, replay.text)
    assert.deepEqual(problemFields(replay.body), [['code', 'code_incorrect']])
    const next = await postJson(client, MFA_CHALLENGE_PATH, { code: codeAt(secret, 1) })
    assert.equal(next.status, 200, next.text)
    assert.equal(await statusOf(getJson(client, ADMIN_API)), 200)
  })

  test('T-SEC-008 a wrong code at confirmation answers 422 on code with auth.mfa_failed and changes nothing', async ({
    assert,
  }) => {
    const staff = await staffWithoutTotp()
    const token = await tokenFor(staff.id, 'mfa_enrollment')
    const client = await device(staff)
    const { secret } = await started(client, token.raw)

    const response = await postJson(client, TOTP_CONFIRM_PATH, {
      code: wrongCode(secret),
      token: token.raw,
    })
    assert.equal(response.status, 422, response.text)
    assert.deepEqual(problemFields(response.body), [['code', 'code_incorrect']])
    assert.lengthOf(await auditRows('auth.mfa_failed', staff.id), 1)
    assert.isNull(await userColumn(staff.id, 'mfa_enabled_at'))
    assert.isNull(await consumedAt(token.id))
    const point = await rateLimiter('mfa_user').get(rateLimitKey('mfa_user', staff.id))
    assert.equal(point?.consumed, 1)
  })

  test('T-SEC-008 a caller who is not active staff gets 403 from the three operations and charges nothing', async ({
    assert,
  }) => {
    const customer = await UserFactory.create()
    const client = await device(customer)
    for (const [path, body] of [
      [TOTP_START_PATH, { token: 'x'.repeat(43), password: FACTORY_PASSWORD }],
      [TOTP_CONFIRM_PATH, { code: '123456', token: 'x'.repeat(43) }],
      [MFA_CHALLENGE_PATH, { code: '123456' }],
    ] as const) {
      const response = await postJson(client, path, body)
      assert.equal(response.status, 403, `${path}: ${response.text}`)
      assert.equal(response.body.code, 'FORBIDDEN')
    }
    assert.isNull(await rateLimiter('mfa_user').get(rateLimitKey('mfa_user', customer.id)))
    assert.isNull(await rateLimiter('reauth_user').get(rateLimitKey('reauth_user', customer.id)))
  })

  test('T-SEC-008 the challenge before enrolment and a confirmation without a started enrolment answer 409', async ({
    assert,
  }) => {
    const staff = await staffWithoutTotp()
    const token = await tokenFor(staff.id, 'mfa_enrollment')
    const client = await device(staff)
    const challenge = await postJson(client, MFA_CHALLENGE_PATH, { code: '123456' })
    assert.equal(challenge.status, 409, challenge.text)
    const confirm = await postJson(client, TOTP_CONFIRM_PATH, { code: '123456', token: token.raw })
    assert.equal(confirm.status, 409, confirm.text)
    assert.isNull(await rateLimiter('mfa_user').get(rateLimitKey('mfa_user', staff.id)))
  })

  test('T-SEC-008 staff without TOTP get enrollment_required from the admin API, and the admin page sends them to /mfa [AC-FR-IAM-007-1]', async ({
    assert,
  }) => {
    const staff = await staffWithoutTotp()
    const client = await device(staff)
    const api = await getJson(client, ADMIN_API)
    assert.equal(api.status, 401, api.text)
    assert.include(api.body, { code: 'MFA_REQUIRED', mfa: 'enrollment_required' })

    const page = await client.browser.request('/admin/logistics', {
      headers: { Accept: 'text/html' },
    })
    await page.text()
    assert.equal(page.status, 302)
    const location = new URL(page.headers.get('location') ?? '', 'http://localhost')
    assert.equal(location.pathname, '/mfa')
    assert.equal(location.searchParams.get('return_to'), '/admin/logistics')
  })

  test('T-SEC-008 a valid code opens the admin API; T-SEC-009 the session continues under a new, tagged ID holding the proof as { user_id, at }', async ({
    assert,
  }) => {
    const { user, secret } = await enrolledStaff()
    const client = await device(user)
    const refused = await getJson(client, ADMIN_API)
    assert.include(refused.body, { code: 'MFA_REQUIRED', mfa: 'verification_required' })

    const before = sessionIdOf(client.browser)
    const response = await postJson(client, MFA_CHALLENGE_PATH, {
      code: codeAt(secret),
      return_to: '/admin/logistics',
    })
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body, { data: { redirect_to: '/admin/logistics' } })

    const after = sessionIdOf(client.browser)
    assert.notEqual(after, before)
    assert.isNull(await db.from('sessions').where('id', before).first())
    const row = await db.from('sessions').where('id', after).firstOrFail()
    assert.equal(row.user_id, user.id)
    const data = sessionData(row)
    const proof = data.mfa_verified_at as { user_id: string; at: string }
    assert.equal(proof.user_id, user.id)
    assert.isBelow(Math.abs(Date.now() - Date.parse(proof.at)), 60_000)
    assert.equal(data.admin_seen_at, proof.at)

    assert.isAtLeast(await userColumn(user.id, 'mfa_last_used_step'), totpStep(Date.now()) - 1)
    assert.lengthOf(await auditRows('auth.mfa_verify', user.id), 1)
    // A right code clears the limiter keys, so only wrong codes count.
    assert.isNull(await rateLimiter('mfa_user').get(rateLimitKey('mfa_user', user.id)))
    assert.equal(await statusOf(getJson(client, ADMIN_API)), 200)
  })

  test('T-SEC-008 a wrong code answers 422 on code with one auth.mfa_failed row; an accepted code is refused the second time [AC-FR-IAM-007-3]', async ({
    assert,
  }) => {
    const { user, secret } = await enrolledStaff()
    const client = await device(user)
    const wrong = await postJson(client, MFA_CHALLENGE_PATH, { code: wrongCode(secret) })
    assert.equal(wrong.status, 422, wrong.text)
    assert.deepEqual(problemFields(wrong.body), [['code', 'code_incorrect']])
    assert.lengthOf(await auditRows('auth.mfa_failed', user.id), 1)
    assert.isNull(await userColumn(user.id, 'mfa_last_used_step'))

    const old = await postJson(client, MFA_CHALLENGE_PATH, { code: codeAt(secret, -3) })
    assert.equal(old.status, 422, old.text)

    const code = codeAt(secret)
    assert.equal(await statusOf(postJson(client, MFA_CHALLENGE_PATH, { code })), 200)
    const replay = await postJson(client, MFA_CHALLENGE_PATH, { code })
    assert.equal(replay.status, 422, replay.text)
  })

  test('T-SEC-017 verifyMfaChallenge turns return_to {return_to} into redirect_to {expected}')
    .with([
      { return_to: '/admin/logistics?page=2', expected: '/admin/logistics?page=2' },
      { return_to: 'https://evil.example', expected: '/' },
      { return_to: '//evil.example', expected: '/' },
      { return_to: '/api/v1/me', expected: '/' },
      { return_to: null, expected: '/' },
    ])
    .run(async ({ assert }, { return_to: returnTo, expected }) => {
      const { user, secret } = await enrolledStaff()
      const client = await device(user)
      const response = await postJson(client, MFA_CHALLENGE_PATH, {
        code: codeAt(secret),
        ...(returnTo === null ? {} : { return_to: returnTo }),
      })
      assert.equal(response.status, 200, response.text)
      assert.equal(response.body.data.redirect_to, expected)
    })

  test('T-SEC-008 an active non-staff user gets 404 from the admin API, never MFA_REQUIRED, also hours after sign-in; so does a pending_verification user with a staff row', async ({
    assert,
  }) => {
    const customer = await UserFactory.create()
    const idle = await device(customer, undefined, { adminSeenAt: hoursAgo(3) })
    const hidden = await getJson(idle, ADMIN_API)
    assert.equal(hidden.status, 404, hidden.text)
    assert.equal(hidden.body.code, 'NOT_FOUND')

    const pending = await UserFactory.apply('pending_verification').create()
    await db.table('platform_staff').insert({ user_id: pending.id, role: 'platform_admin' })
    const unverified = await getJson(await device(pending), ADMIN_API)
    assert.equal(unverified.status, 404, unverified.text)
  })

  test('T-SEC-009 past 2 hours of admin idle the proof is forgotten and the admin API asks for a new code; a challenge opens it again', async ({
    assert,
  }) => {
    const { user, secret } = await enrolledStaff()
    const client = await device(user, minutesAgo(150), {
      authenticatedAt: minutesAgo(180),
      adminSeenAt: minutesAgo(121),
    })
    const idle = await getJson(client, ADMIN_API)
    assert.equal(idle.status, 401, idle.text)
    assert.include(idle.body, { code: 'MFA_REQUIRED', mfa: 'verification_required' })
    const [row] = await db.from('sessions').where('user_id', user.id)
    assert.notProperty(sessionData(row), 'mfa_verified_at')

    assert.equal(
      await statusOf(postJson(client, MFA_CHALLENGE_PATH, { code: codeAt(secret) })),
      200
    )
    assert.equal(await statusOf(getJson(client, ADMIN_API)), 200)
  })

  test('T-SEC-009 a staff session signed in more than 7 days ago is ended by the admin API with 401 UNAUTHENTICATED', async ({
    assert,
  }) => {
    const { user } = await enrolledStaff()
    const client = await device(user, minutesAgo(60), {
      authenticatedAt: hoursAgo(7 * 24 + 1),
      adminSeenAt: minutesAgo(1),
    })
    const sessionId = sessionIdOf(client.browser)
    const expired = await getJson(client, ADMIN_API)
    assert.equal(expired.status, 401, expired.text)
    assert.equal(expired.body.code, 'UNAUTHENTICATED')
    assert.isNull(await db.from('sessions').where('id', sessionId).first())
    assert.equal(await statusOf(getJson(client, ME_PATH)), 401)
  })

  test('T-SEC-102 the MFA audit rows hold no email, secret or code', async ({ assert }) => {
    const staff = await staffWithoutTotp()
    const token = await tokenFor(staff.id, 'mfa_enrollment')
    const client = await device(staff)
    const { secret } = await started(client, token.raw)
    const bad = wrongCode(secret)
    await postJson(client, TOTP_CONFIRM_PATH, { code: bad, token: token.raw })
    const good = codeAt(secret)
    await postJson(client, TOTP_CONFIRM_PATH, { code: good, token: token.raw })
    const next = codeAt(secret, 1)
    await postJson(client, MFA_CHALLENGE_PATH, { code: next })

    const rows = await db.from('audit_logs').where('subject_id', staff.id)
    assert.includeMembers(
      rows.map((row) => row.action),
      [
        'auth.mfa_enrollment_start',
        'auth.mfa_failed',
        'platform_staff.mfa_enable',
        'auth.mfa_verify',
      ]
    )
    for (const row of rows) {
      const text = JSON.stringify([row.changes, row.reason])
      for (const value of [staff.email, secret, bad, good, next, token.raw]) {
        assert.notInclude(text, value, row.action)
      }
    }
  })

  test('T-API-002 an extra member on each MFA operation answers 422 unknown_field', async ({
    assert,
  }) => {
    const { user } = await enrolledStaff()
    const client = await device(user)
    for (const [path, body] of [
      [TOTP_START_PATH, { token: 'x', password: 'y', shop_id: 'z' }],
      [TOTP_CONFIRM_PATH, { code: '123456', token: 'x', secret: 'z' }],
      [MFA_CHALLENGE_PATH, { code: '123456', remember: true }],
    ] as const) {
      const response = await postJson(client, path, body)
      assert.equal(response.status, 422, `${path}: ${response.text}`)
      assert.include(
        problemFields(response.body).map(([, code]) => code),
        'unknown_field',
        path
      )
    }
    assert.isNull(await rateLimiter('mfa_user').get(rateLimitKey('mfa_user', user.id)))
  })

  test('T-OPS-019 an admin made by platform:create-admin is sent to /mfa, cannot use the admin API until enrolled with the emailed token, then opens it', async ({
    assert,
  }) => {
    const email = `t-ops-019-${Date.now()}@example.com`
    const action = new BootstrapPlatformAdmin()
    await action.execute({
      email,
      fullName: 'Hari Admin',
      password: FACTORY_PASSWORD,
      grantExistingAccount: false,
    })
    const admin = await db.from('users').where('email', email).firstOrFail()
    const tokens = await db
      .from('user_tokens')
      .where({ user_id: admin.id, purpose: 'mfa_enrollment' })
      .whereNull('consumed_at')
    assert.lengthOf(tokens, 1)
    const raw = await rawTokenOf(tokens[0].id, 'mfa_enrollment')

    const client = await guest()
    charged.push({ userId: admin.id, email, ips: [client.ip] })
    const login = await postJson(client, LOG_IN_PATH, { email, password: FACTORY_PASSWORD })
    assert.equal(login.status, 200, login.text)
    assert.equal(login.body.data.redirect_to, '/mfa')
    const gate = await getJson(client, ADMIN_API)
    assert.include(gate.body, { code: 'MFA_REQUIRED', mfa: 'enrollment_required' })

    const withoutToken = await postJson(client, TOTP_START_PATH, {
      token: 'x'.repeat(43),
      password: FACTORY_PASSWORD,
    })
    assert.equal(withoutToken.status, 422, withoutToken.text)
    const { secret } = await started(client, raw)
    const confirm = await postJson(client, TOTP_CONFIRM_PATH, { code: codeAt(secret), token: raw })
    assert.equal(confirm.status, 200, confirm.text)
    const verify = await postJson(client, MFA_CHALLENGE_PATH, { code: codeAt(secret, 1) })
    assert.equal(verify.status, 200, verify.text)
    assert.equal(await statusOf(getJson(client, ADMIN_API)), 200)
  })
})

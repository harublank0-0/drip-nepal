import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import hash from '@adonisjs/core/services/hash'
import { Scrypt } from '@adonisjs/core/hash/drivers/scrypt'
import { CookieClient } from '@adonisjs/core/http'
import { MessageBuilder } from '@adonisjs/core/helpers'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { ShopFactory } from '#database/factories/shop_factory'
import { placeholderCiphertext } from '#database/factories/placeholder_ciphertext'
import { auditEmailSubject } from '#modules/audit/actions/record_audit'
import { phoneBlindIndex } from '#modules/platform/crypto/blind_index'
import { encryptField } from '#modules/platform/crypto/field_encrypter'
import { INVALID_CREDENTIALS_DETAIL } from '#shared/constants/auth'
import type { Browser } from '#tests/support/browser'
import { send, signIn, statusOf } from '#tests/support/courier_http'
import { captureLogs } from '#tests/support/logs'
import {
  LOG_IN_PATH,
  ME_PATH,
  countingScrypt,
  deleteJson,
  forgetLogin,
  getJson,
  guest,
  postJson,
  type Guest,
} from '#tests/support/identity'

/*
 * `logIn`, `logOut` and `getMe` over HTTP (docs/06 §13.3; 01 FR-IAM-003;
 * 02 J-04 step 5; docs/07 §3.1, §3.2, §3.6, §3.11; M1 part 3):
 * - T-IAM-003: an `active` or `pending_verification` user signs in (200,
 *   the user and `redirect_to`, `last_login_at`, one `auth.login` row);
 *   the email is normalised; a suspended or deactivated user with the
 *   right password gets 403 and no session; a signed-in caller gets 409;
 *   field rules answer 422.
 * - T-SEC-009: the session ID changes at sign-in and the new row is tagged
 *   and holds the stamp and the login times; `logOut` deletes the row and
 *   the old cookie is refused; staff A's MFA time never unlocks staff B,
 *   who signs in in the same browser with a password only.
 * - T-SEC-012: a wrong password and an unknown email answer the same 401
 *   and spend one scrypt hash each, the dummy hash of the unknown email.
 * - T-SEC-011: an anonymised account's email answers the unknown email's
 *   401, without an error.
 * - T-SEC-017: `return_to` becomes `redirect_to` only when it is a path on
 *   this site, percent-encoded values included; a rejected one is logged
 *   by its length, never its value.
 * - T-IAM-003, the compare-and-set of the sign-in: a hash with older scrypt
 *   parameters is replaced once; an account suspended between the check
 *   and the write gets 403, and a stamp rotated or a password reset in that
 *   window gets the generic 401, with no session and the new hash kept.
 *   The window is entered through the rehash: a patched `scrypt.make` runs
 *   the change, as a concurrent request would commit it.
 * - T-SEC-101: a 254-character unknown email answers 401 with one
 *   `auth.login_failed` row whose subject is a 64-character hash.
 * - T-SEC-013 and T-API-002: no XSRF header, or an extra member, is
 *   refused.
 * - T-IAM-004: `getMe` answers the caller's own account, nothing secret.
 *
 * Accounts come from `UserFactory`, whose password hash is the model's
 * scrypt hash, as `signUp`'s is; no action reaches `suspended` or
 * `deactivated` before M1 part 7 (docs/10 §3.4). Each test signs in from a
 * random client network (`X-Forwarded-For`) and deletes the limiter keys
 * it made, which commit on their own connection; the 429 cases are in
 * tests/concurrency/identity/log_in.spec.ts.
 */

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

const auditRows = (action: string, subjectId: string) =>
  db.from('audit_logs').where({ action, subject_id: subjectId })

async function activeUser(state?: 'pending_verification' | 'suspended' | 'deactivated') {
  const user = state ? await UserFactory.apply(state).create() : await UserFactory.create()
  // `security_stamp` comes from the column default.
  await user.refresh()
  return user
}

// The factory password hashed with older scrypt parameters (cost 8192), which logIn replaces.
async function withOlderHash(userId: string) {
  const older = await new Scrypt({ cost: 8192, blockSize: 8, parallelization: 1 }).make(
    FACTORY_PASSWORD
  )
  await db.from('users').where('id', userId).update({ password_hash: older })
  return older
}

/*
 * Runs `change` inside logIn's rehash (`scrypt.make`), after the password
 * check and before step 5's compare-and-set, as a request that commits in
 * that window would.
 */
async function duringRehash<T>(change: () => Promise<unknown>, run: () => Promise<T>) {
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

// A staff member with TOTP enrolled (a placeholder secret) and a password that signs in.
async function staffWithPassword(role = 'platform_admin') {
  const user = await activeUser()
  await db
    .from('users')
    .where('id', user.id)
    .update({ mfa_enabled_at: db.raw('now()'), mfa_totp_secret_enc: placeholderCiphertext() })
  await db.table('platform_staff').insert({ user_id: user.id, role })
  return user
}

const problemFields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

// The members of a problem that do not change from one request to the next.
const stable = (body: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(body).filter(([member]) => member !== 'request_id'))

test.group('T-IAM-003 logIn', (group) => {
  let client: Guest
  let emails: string[]
  group.each.setup(async () => {
    client = await guest()
    emails = []
    return async () => {
      for (const email of emails) await forgetLogin(email, client.ip)
    }
  })

  function logInAs(email: string, password: string, extra: Record<string, unknown> = {}) {
    emails.push(email)
    return postJson(client, LOG_IN_PATH, { email, password, ...extra })
  }

  test('T-IAM-003 an active user signs in: 200 with the user and redirect_to, last_login_at and one auth.login row [AC-FR-IAM-003-1, AC-J04-09]', async ({
    assert,
  }) => {
    const user = await activeUser()
    const response = await logInAs(user.email, FACTORY_PASSWORD)
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body, {
      data: {
        user: { id: user.id, email: user.email, full_name: user.fullName, status: 'active' },
        redirect_to: '/',
      },
    })

    const fresh = await db.from('users').where('id', user.id).firstOrFail()
    assert.instanceOf(fresh.last_login_at, Date)
    const audits = await auditRows('auth.login', user.id)
    assert.lengthOf(audits, 1)
    assert.include(audits[0], {
      actor_type: 'customer',
      actor_user_id: user.id,
      actor_role: null,
      subject_type: 'user',
      request_id: response.headers.get('x-request-id'),
    })
    assert.deepEqual(audits[0].changes, {})
    assert.lengthOf(audits[0].ip_hash, 32)

    // The session works: the caller's own account answers.
    const me = await getJson(client, ME_PATH)
    assert.equal(me.status, 200, me.text)
    assert.equal(me.body.data.id, user.id)
  })

  test('T-IAM-003 a pending_verification user may sign in [AC-FR-IAM-003-1, 02 J-04 Recovery]', async ({
    assert,
  }) => {
    const user = await activeUser('pending_verification')
    const response = await logInAs(user.email, FACTORY_PASSWORD)
    assert.equal(response.status, 200, response.text)
    assert.equal(response.body.data.user.status, 'pending_verification')
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 1)
  })

  test('T-IAM-003 the email is trimmed and lower-cased before the lookup [RF-22]', async ({
    assert,
  }) => {
    const user = await activeUser()
    const response = await logInAs(` ${user.email.toUpperCase()} `, FACTORY_PASSWORD)
    assert.equal(response.status, 200, response.text)
    assert.equal(response.body.data.user.id, user.id)
  })

  test('T-IAM-003 a staff member signs in as a staff actor, without MFA', async ({ assert }) => {
    const staff = await staffWithPassword('support_agent')
    const response = await logInAs(staff.email, FACTORY_PASSWORD)
    assert.equal(response.status, 200, response.text)
    const [audit] = await auditRows('auth.login', staff.id)
    assert.include(audit, { actor_type: 'platform_staff', actor_role: 'platform:support_agent' })
    // No `mfa_verified_at`: the admin surface asks for the TOTP challenge (docs/07 §3.9).
    const [row] = await db.from('sessions').where('user_id', staff.id)
    assert.notProperty(sessionData(row), 'mfa_verified_at')
  })

  test(
    'T-IAM-003 a {status} user with the right password gets 403 ACCOUNT_SUSPENDED and no session [AC-FR-IAM-003-4]'
  )
    .with(['suspended', 'deactivated'] as const)
    .run(async ({ assert }, status) => {
      const user = await activeUser(status)
      const before = sessionIdOf(client.browser)
      const response = await logInAs(user.email, FACTORY_PASSWORD)
      assert.equal(response.status, 403, response.text)
      assert.equal(response.body.code, 'ACCOUNT_SUSPENDED')
      assert.notProperty(response.body, 'user')

      // The guest's session is unchanged; nothing is tagged with the user.
      assert.equal(sessionIdOf(client.browser), before)
      assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)
      const fresh = await db.from('users').where('id', user.id).firstOrFail()
      assert.isNull(fresh.last_login_at)
      const failed = await auditRows('auth.login_failed', user.id)
      assert.lengthOf(failed, 1)
      assert.deepEqual(failed[0].changes, { cause: 'account_status', status })
      assert.lengthOf(await auditRows('auth.login', user.id), 0)
    })

  test('T-IAM-003 a signed-in caller gets 409 CONFLICT and stays signed in as before', async ({
    assert,
  }) => {
    const first = await activeUser()
    const second = await activeUser()
    assert.equal(await statusOf(logInAs(first.email, FACTORY_PASSWORD)), 200)
    const response = await logInAs(second.email, FACTORY_PASSWORD)
    assert.equal(response.status, 409, response.text)
    assert.equal(response.body.code, 'CONFLICT')
    assert.equal(response.body.detail, 'You are already signed in.')
    const me = await getJson(client, ME_PATH)
    assert.equal(me.body.data.id, first.id)
    assert.lengthOf(await auditRows('auth.login', second.id), 0)
  })

  test('T-IAM-003 {name} is refused with 422 on {field} and nobody signs in')
    .with([
      { name: 'no password', field: 'password', body: { email: 'ram@example.com' } },
      {
        name: 'an empty password',
        field: 'password',
        body: { email: 'ram@example.com', password: '' },
      },
      {
        name: 'a 129-character password',
        field: 'password',
        body: { email: 'ram@example.com', password: 'p'.repeat(129) },
      },
      { name: 'no email', field: 'email', body: { password: 'anything' } },
      { name: 'an email without a domain', field: 'email', body: { email: 'ram', password: 'x' } },
      {
        name: 'a return_to that is not a string',
        field: 'return_to',
        body: { email: 'ram@example.com', password: 'x', return_to: 7 },
      },
    ])
    .run(async ({ assert }, { field, body }) => {
      const response = await postJson(client, LOG_IN_PATH, body)
      assert.equal(response.status, 422, response.text)
      assert.equal(response.body.code, 'VALIDATION_FAILED')
      assert.deepEqual(
        response.body.errors.map((item: { field: string }) => item.field),
        [field]
      )
      const requestId = response.headers.get('x-request-id')
      assert.lengthOf(await db.from('audit_logs').where('request_id', requestId ?? ''), 0)
    })

  test('T-API-002 an extra member on logIn or logOut answers 422 unknown_field and changes nothing', async ({
    assert,
  }) => {
    const user = await activeUser()
    const extra = await logInAs(user.email, FACTORY_PASSWORD, { remember_me: true })
    assert.equal(extra.status, 422, extra.text)
    assert.deepEqual(problemFields(extra.body), [['remember_me', 'unknown_field']])
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)

    assert.equal(await statusOf(logInAs(user.email, FACTORY_PASSWORD)), 200)
    const out = await send(client.browser, 'DELETE', LOG_IN_PATH, { everywhere: true })
    assert.equal(out.status, 422, out.text)
    assert.deepEqual(problemFields(out.body), [['everywhere', 'unknown_field']])
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 1)
  })

  test('T-SEC-012 a wrong password and an unknown email answer the same 401 and spend one scrypt hash each [AC-FR-IAM-003-2, AC-J04-08]', async ({
    assert,
  }) => {
    const user = await activeUser()
    const unknownEmail = `t-sec-012-${randomUUID()}@example.com`

    const wrong = await countingScrypt(() => logInAs(user.email, `${FACTORY_PASSWORD}x`))
    const unknown = await countingScrypt(() => logInAs(unknownEmail, FACTORY_PASSWORD))

    assert.equal(wrong.result.status, 401, wrong.result.text)
    assert.equal(unknown.result.status, 401, unknown.result.text)
    assert.deepEqual(stable(wrong.result.body), stable(unknown.result.body))
    assert.include(wrong.result.body, {
      code: 'UNAUTHENTICATED',
      detail: 'Invalid email or password.',
    })
    // One hash on each branch: a verify against the stored hash, or the dummy hash.
    assert.deepInclude(wrong, { make: 0, verify: 1 })
    assert.deepInclude(unknown, { make: 1, verify: 0 })

    // One row each: the account by its id, the unknown email by its keyed hash only.
    const named = await auditRows('auth.login_failed', user.id)
    assert.lengthOf(named, 1)
    assert.include(named[0], { subject_type: 'user', actor_user_id: null, actor_type: 'customer' })
    assert.deepEqual(named[0].changes, { cause: 'invalid_credentials' })
    const hashed = await auditRows('auth.login_failed', auditEmailSubject(unknownEmail))
    assert.lengthOf(hashed, 1)
    assert.equal(hashed[0].subject_type, 'email_hash')
    assert.match(hashed[0].subject_id, /^[0-9a-f]{64}$/)
    assert.notInclude(JSON.stringify(hashed[0]), unknownEmail)
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)
  })

  test('T-SEC-011 an anonymised account answers the unknown email 401 and reports no error', async ({
    assert,
  }) => {
    const user = await activeUser()
    const placeholder = `deleted-${user.id}@anonymized.invalid`
    await db.from('users').where('id', user.id).update({
      status: 'anonymized',
      anonymized_at: new Date(),
      email: placeholder,
      full_name: null,
      password_hash: null,
      age_confirmed_at: null,
    })
    const { result, make, verify } = await countingScrypt(() =>
      logInAs(placeholder, FACTORY_PASSWORD)
    )
    assert.equal(result.status, 401, result.text)
    assert.equal(result.body.detail, 'Invalid email or password.')
    // The unknown-email path: the dummy hash, no verify against a null hash (docs/07 §3.6).
    assert.deepEqual({ make, verify }, { make: 1, verify: 0 })
  })

  test('T-SEC-017 logIn turns return_to {return_to} into redirect_to {expected}')
    .with([
      { return_to: '/checkout?step=2', expected: '/checkout?step=2' },
      { return_to: '/verify-email', expected: '/verify-email' },
      { return_to: null, expected: '/' },
      { return_to: 'https://evil.example/login', expected: '/' },
      { return_to: 'https:evil.example', expected: '/' },
      { return_to: '//evil.example', expected: '/' },
      { return_to: '/\\evil.example', expected: '/' },
      { return_to: '/\t/evil.example', expected: '/' },
      { return_to: '/\r\n/evil.example', expected: '/' },
      { return_to: '/.//evil.example', expected: '/' },
      { return_to: '/..//evil.example', expected: '/' },
      { return_to: '/%2e//evil.example', expected: '/' },
      { return_to: '/api/v1/me', expected: '/' },
      { return_to: `/${'a'.repeat(2048)}`, expected: '/' },
      // Percent-encoded, a backslash, tab or newline is path text on this site (TM-14).
      { return_to: '/%5Cevil.example', expected: '/%5Cevil.example' },
      { return_to: '/%09/evil.example', expected: '/%09/evil.example' },
      { return_to: '/%0A/evil.example', expected: '/%0A/evil.example' },
      { return_to: '/%0D%0A/evil.example', expected: '/%0D%0A/evil.example' },
    ])
    .run(async ({ assert }, { return_to: returnTo, expected }) => {
      const user = await activeUser()
      const response = await logInAs(user.email, FACTORY_PASSWORD, { return_to: returnTo })
      assert.equal(response.status, 200, response.text)
      assert.equal(response.body.data.redirect_to, expected)
    })

  test('T-SEC-017 a rejected return_to is logged as auth.return_to_rejected by its length, never its value', async ({
    assert,
  }) => {
    const user = await activeUser()
    const value = 'https://evil.example/collect?token=t-sec-017-secret'
    let requestId: string | null = null
    const lines = await captureLogs(async () => {
      const response = await logInAs(user.email, FACTORY_PASSWORD, { return_to: value })
      assert.equal(response.status, 200, response.text)
      assert.equal(response.body.data.redirect_to, '/')
      requestId = response.headers.get('x-request-id')
    })
    const rejected = lines.filter((line) => line.message === 'auth.return_to_rejected')
    assert.lengthOf(rejected, 1)
    assert.deepEqual(rejected[0].fields, { return_to_length: value.length })
    assert.equal(rejected[0].request_id, requestId)
    for (const leak of ['evil.example', 't-sec-017-secret']) {
      assert.notInclude(JSON.stringify(lines), leak)
    }
  })

  test('T-SEC-101 a 254-character unknown email answers 401 with one auth.login_failed row of a 64-character subject', async ({
    assert,
  }) => {
    // A local part of 64 and three labels within 63, as an address allows.
    const local = `${randomUUID().replaceAll('-', '')}${'x'.repeat(32)}`
    const email = `${local}@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(57)}.com`
    assert.lengthOf(email, 254)
    const response = await logInAs(email, FACTORY_PASSWORD)
    assert.equal(response.status, 401, response.text)
    const rows = await auditRows('auth.login_failed', auditEmailSubject(email))
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].subject_type, 'email_hash')
    assert.lengthOf(rows[0].subject_id, 64)
  })

  test('T-SEC-013 logIn and logOut without X-XSRF-TOKEN get 403 FORBIDDEN and change nothing', async ({
    assert,
  }) => {
    const user = await activeUser()
    assert.equal(await statusOf(logInAs(user.email, FACTORY_PASSWORD)), 200)
    const out = await deleteJson(client, LOG_IN_PATH, { 'X-XSRF-TOKEN': '' })
    assert.equal(out.status, 403, out.text)
    assert.equal(out.body.code, 'FORBIDDEN')
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 1)

    const other = await guest()
    const second = await activeUser()
    emails.push(second.email)
    const blocked = await postJson(
      other,
      LOG_IN_PATH,
      { email: second.email, password: FACTORY_PASSWORD },
      { 'X-XSRF-TOKEN': '' }
    )
    assert.equal(blocked.status, 403, blocked.text)
    assert.equal(blocked.body.code, 'FORBIDDEN')
    assert.lengthOf(await db.from('sessions').where('user_id', second.id), 0)
    await forgetLogin(second.email, other.ip)
  })
})

test.group('T-IAM-003 the compare-and-set of the sign-in', (group) => {
  let client: Guest
  let emails: string[]
  group.each.setup(async () => {
    client = await guest()
    emails = []
    return async () => {
      for (const email of emails) await forgetLogin(email, client.ip)
    }
  })

  function logInAs(email: string) {
    emails.push(email)
    return postJson(client, LOG_IN_PATH, { email, password: FACTORY_PASSWORD })
  }

  test('T-IAM-003 a hash made with older scrypt parameters is replaced at sign-in, once [docs/07 §3.7]', async ({
    assert,
  }) => {
    const user = await activeUser()
    const older = await withOlderHash(user.id)
    const { result, make, verify } = await countingScrypt(() => logInAs(user.email))
    assert.equal(result.status, 200, result.text)
    // One verify against the older hash, one make for its replacement.
    assert.deepEqual({ make, verify }, { make: 1, verify: 1 })

    const fresh = await db.from('users').where('id', user.id).firstOrFail()
    assert.notEqual(fresh.password_hash, older)
    const scrypt = hash.use('scrypt')
    assert.isFalse(scrypt.needsReHash(fresh.password_hash))
    assert.isTrue(await scrypt.verify(fresh.password_hash, FACTORY_PASSWORD))
    const audits = await auditRows('auth.login', user.id)
    assert.lengthOf(audits, 1)
    assert.deepEqual(audits[0].changes, { changed: ['password_hash'] })
  })

  test('T-IAM-003 an account suspended between the check and the write gets 403, no session, and keeps its hash', async ({
    assert,
  }) => {
    const user = await activeUser()
    const older = await withOlderHash(user.id)
    const response = await duringRehash(
      () => db.from('users').where('id', user.id).update({ status: 'suspended' }),
      () => logInAs(user.email)
    )
    assert.equal(response.status, 403, response.text)
    assert.equal(response.body.code, 'ACCOUNT_SUSPENDED')
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)

    const fresh = await db.from('users').where('id', user.id).firstOrFail()
    assert.equal(fresh.password_hash, older)
    assert.isNull(fresh.last_login_at)
    const failed = await auditRows('auth.login_failed', user.id)
    assert.lengthOf(failed, 1)
    assert.deepEqual(failed[0].changes, { cause: 'account_status', status: 'suspended' })
    assert.lengthOf(await auditRows('auth.login', user.id), 0)
  })

  test(
    'T-IAM-003 a {name} between the check and the write gets the generic 401, no session, and keeps the account as changed'
  )
    .with([
      { name: 'stamp rotation ("sign out everywhere")', password: false },
      { name: 'password reset', password: true },
    ])
    .run(async ({ assert }, { password }) => {
      const user = await activeUser()
      const older = await withOlderHash(user.id)
      const newHash = await hash.use('scrypt').make(randomUUID())
      const response = await duringRehash(
        () =>
          db
            .from('users')
            .where('id', user.id)
            .update({
              security_stamp: db.raw('gen_random_uuid()'),
              ...(password ? { password_hash: newHash } : {}),
            }),
        () => logInAs(user.email)
      )
      assert.equal(response.status, 401, response.text)
      assert.include(response.body, {
        code: 'UNAUTHENTICATED',
        detail: INVALID_CREDENTIALS_DETAIL,
      })
      assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)

      // No rehash of the old password over what the change wrote.
      const fresh = await db.from('users').where('id', user.id).firstOrFail()
      assert.equal(fresh.password_hash, password ? newHash : older)
      assert.notEqual(fresh.security_stamp, user.securityStamp)
      assert.isNull(fresh.last_login_at)
      const failed = await auditRows('auth.login_failed', user.id)
      assert.lengthOf(failed, 1)
      assert.deepEqual(failed[0].changes, { cause: 'account_changed' })
    })
})

test.group('T-SEC-009 sessions at sign-in and sign-out', (group) => {
  let client: Guest
  let emails: string[]
  group.each.setup(async () => {
    client = await guest()
    emails = []
    return async () => {
      for (const email of emails) await forgetLogin(email, client.ip)
    }
  })

  async function signedIn(user: { email: string }) {
    emails.push(user.email)
    const response = await postJson(client, LOG_IN_PATH, {
      email: user.email,
      password: FACTORY_PASSWORD,
    })
    if (response.status !== 200) throw new Error(`logIn answered ${response.status}`)
    return response
  }

  test('T-SEC-009 logIn issues a new session ID, tags the new row and stores the stamp and the login times', async ({
    assert,
  }) => {
    const user = await activeUser()
    const before = sessionIdOf(client.browser)
    await signedIn(user)
    const after = sessionIdOf(client.browser)
    assert.notEqual(after, before)
    assert.isNull(await sessionRow(before))

    // The tag follows login()'s new ID (docs/07 §3.1): the regenerated row carries user_id.
    const row = await db.from('sessions').where('id', after).firstOrFail()
    assert.equal(row.user_id, user.id)
    const data = sessionData(row)
    assert.equal(data.security_stamp, user.securityStamp)
    for (const key of ['authenticated_at', 'seller_seen_at', 'admin_seen_at']) {
      assert.isTrue(Number.isFinite(Date.parse(String(data[key]))), key)
    }
    assert.notProperty(data, 'mfa_verified_at')
  })

  test('T-SEC-009 logOut answers 204, deletes the session row, replaces the cookie, and the old cookie is refused [AC-FR-IAM-003-6]', async ({
    assert,
  }) => {
    const user = await activeUser()
    await signedIn(user)
    const sessionId = sessionIdOf(client.browser)
    const staleTab = { browser: client.browser.clone(), ip: client.ip }

    const out = await deleteJson(client, LOG_IN_PATH)
    assert.equal(out.status, 204, out.text)
    assert.equal(out.text, '')
    assert.isNull(await sessionRow(sessionId))
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)
    assert.notEqual(sessionIdOf(client.browser), sessionId)

    for (const tab of [client, staleTab]) {
      const me = await getJson(tab, ME_PATH)
      assert.equal(me.status, 401, me.text)
      assert.equal(me.body.code, 'UNAUTHENTICATED')
    }
  })

  test('T-SEC-009 a guest gets 401 from logOut', async ({ assert }) => {
    const out = await deleteJson(client, LOG_IN_PATH)
    assert.equal(out.status, 401, out.text)
    assert.equal(out.body.code, 'UNAUTHENTICATED')
  })

  test("T-SEC-009 staff A's MFA time does not unlock staff B, who signs in in the same browser with a password only", async ({
    assert,
  }) => {
    const adminList = '/api/v1/admin/logistics/accounts'
    const staffA = await staffWithPassword()
    const staffB = await staffWithPassword()
    const browser = await signIn(staffA.id, new Date().toISOString())
    const shared: Guest = { browser, ip: client.ip }
    assert.equal(await statusOf(getJson(shared, adminList)), 200)

    assert.equal(await statusOf(deleteJson(shared, LOG_IN_PATH)), 204)
    // Clearing dropped Shield's secret; a page visit mints a new one before the next write.
    const visit = await browser.request('/__test__/identity/visit')
    await visit.text()
    emails.push(staffB.email)
    const login = await postJson(shared, LOG_IN_PATH, {
      email: staffB.email,
      password: FACTORY_PASSWORD,
    })
    assert.equal(login.status, 200, login.text)

    const admin = await getJson(shared, adminList)
    assert.equal(admin.status, 401, admin.text)
    assert.include(admin.body, { code: 'MFA_REQUIRED', mfa: 'verification_required' })
  })
})

test.group('T-IAM-004 getMe', (group) => {
  let client: Guest
  let emails: string[]
  group.each.setup(async () => {
    client = await guest()
    emails = []
    return async () => {
      for (const email of emails) await forgetLogin(email, client.ip)
    }
  })

  async function signedIn(user: { email: string }) {
    emails.push(user.email)
    const response = await postJson(client, LOG_IN_PATH, {
      email: user.email,
      password: FACTORY_PASSWORD,
    })
    if (response.status !== 200) throw new Error(`logIn answered ${response.status}`)
  }

  test("T-IAM-004 getMe answers the caller's own profile, consents, phone digits and shops, and nothing secret", async ({
    assert,
  }) => {
    const user = await activeUser()
    const e164 = '+9779851234567'
    await db
      .from('users')
      .where('id', user.id)
      .update({
        marketing_email_consent_at: db.raw('now()'),
        phone_enc: encryptField(e164, 'users.phone_enc'),
        phone_hash: phoneBlindIndex(e164),
        phone_last4: '4567',
      })
    const owned = await ShopFactory.merge({ ownerUserId: user.id }).create()
    const joined = await ShopFactory.create()
    await db
      .table('shop_memberships')
      .insert({ shop_id: joined.id, user_id: user.id, role: 'viewer', status: 'active' })
    await signedIn(user)

    const response = await getJson(client, ME_PATH)
    assert.equal(response.status, 200, response.text)
    const { shops, ...profile } = response.body.data
    assert.deepEqual(profile, {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      status: 'active',
      phone_last4: '4567',
      marketing_email_consent: true,
      marketing_sms_consent: false,
      staff_role: null,
    })
    assert.sameDeepMembers(shops, [
      { slug: owned.slug, name: owned.name, status: 'pending_review', role: 'owner' },
      { slug: joined.slug, name: joined.name, status: 'pending_review', role: 'viewer' },
    ])
    for (const secret of [user.securityStamp, e164, '9851234567', '$scrypt$', 'password']) {
      assert.notInclude(response.text, secret)
    }
  })

  test("T-IAM-004 a staff member's getMe names the role", async ({ assert }) => {
    const staff = await staffWithPassword('support_agent')
    await signedIn(staff)
    const response = await getJson(client, ME_PATH)
    assert.equal(response.status, 200, response.text)
    assert.equal(response.body.data.staff_role, 'support_agent')
    assert.deepEqual(response.body.data.shops, [])
  })

  test('T-IAM-004 a guest gets 401 from getMe', async ({ assert }) => {
    const response = await getJson(client, ME_PATH)
    assert.equal(response.status, 401, response.text)
    assert.equal(response.body.code, 'UNAUTHENTICATED')
  })
})

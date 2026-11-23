import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { errors as limiterErrors } from '@adonisjs/limiter'
import { UserFactory } from '#database/factories/user_factory'
import { updateMe } from '#modules/identity/actions/update_me'
import { rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { placeholderCiphertext } from '#database/factories/placeholder_ciphertext'
import { minutesAgo, send, signIn } from '#tests/support/courier_http'
import { forgetKeys } from '#tests/support/identity'

/*
 * T-SEC-011, the per-user limits of docs/06 §9.1 that M1 part 6a builds,
 * where real commits matter: the limiter store writes `rate_limits` on its
 * own connection (docs/10 §3.3).
 * - `profile_update` (proposed): the 21st `updateMe` of one user in an
 *   hour gets 429 and writes nothing, so consent toggles cannot grow the
 *   insert-only `audit_logs` without bound.
 * - `api_user`: past 300 calls a minute, an authenticated `/api/v1` call
 *   gets 429 `RATE_LIMITED` with `Retry-After` before its controller runs;
 *   `updateMe`, which has a row of its own, and `logOut` still go through,
 *   so nothing is charged twice and a session can always end.
 * - `api_staff`: an admin call is charged to `api_staff`, not `api_user`.
 * The used-up windows are set with the limiter's `set`, not by sending 300
 * requests. Each test deletes its users, their sessions and audit rows, as
 * the migrator with the retention exemption, and its limiter keys.
 */

const PREFIX = 'conc-apilimit-'

async function account(label: string) {
  const user = await UserFactory.merge({
    email: `${PREFIX}${label}-${randomUUID()}@example.com`,
  }).create()
  await user.refresh()
  return user
}

async function cleanUp(ids: string[]) {
  for (const id of ids) {
    await forgetKeys('profile_update', id)
    await forgetKeys('api_user', id)
    await forgetKeys('api_staff', id)
  }
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    if (ids.length > 0) {
      await trx.from('sessions').whereIn('user_id', ids).delete()
      await trx.from('audit_logs').whereIn('subject_id', ids).delete()
      await trx.from('platform_staff').whereIn('user_id', ids).delete()
      await trx.from('users').whereIn('id', ids).delete()
    }
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

// The window of `name` for `userId`, used up.
const useUp = (name: 'api_user' | 'api_staff', userId: string, requests: number) =>
  rateLimiter(name).set(rateLimitKey(name, userId), requests, '1 minute')

test.group('T-SEC-011 per-user API limits', (group) => {
  let ids: string[]
  group.each.setup(() => {
    ids = []
    return () => cleanUp(ids)
  })

  test('T-SEC-011 the 21st updateMe of one user in an hour gets 429 and writes nothing (profile_update)', async ({
    assert,
  }) => {
    const user = await account('profile')
    ids.push(user.id)
    const context = { requestId: null, ipHash: null }
    for (let n = 0; n < 20; n++) {
      await updateMe(
        user.id,
        { marketingEmailConsent: n % 2 === 0, sessionStamp: user.securityStamp },
        context
      )
    }
    const consents = () =>
      db.from('audit_logs').where({ action: 'user.consent_change', subject_id: user.id })
    assert.lengthOf(await consents(), 20)

    const refused = await updateMe(
      user.id,
      { marketingEmailConsent: true, fullName: 'Not Saved', sessionStamp: user.securityStamp },
      context
    ).then(
      () => null,
      (error) => error
    )
    assert.instanceOf(refused, limiterErrors.E_TOO_MANY_REQUESTS)
    assert.lengthOf(await consents(), 20)
    const row = await db.from('users').where('id', user.id).firstOrFail()
    assert.isNull(row.marketing_email_consent_at)
    assert.notEqual(row.full_name, 'Not Saved')
  }).timeout(30_000)

  test('T-SEC-011 past api_user an authenticated call gets 429; updateMe and logOut still go through', async ({
    assert,
  }) => {
    const user = await account('api-user')
    ids.push(user.id)
    const browser = await signIn(user.id)
    await useUp('api_user', user.id, 300)

    const refused = await send(browser, 'GET', '/api/v1/me')
    assert.equal(refused.status, 429, refused.text)
    assert.equal(refused.body.code, 'RATE_LIMITED')
    assert.isAbove(Number(refused.headers.get('retry-after')), 0)

    // An operation with a row of its own is not charged to api_user a second time.
    const saved = await send(browser, 'PATCH', '/api/v1/me', { full_name: 'Still Saved' })
    assert.equal(saved.status, 200, saved.text)
    const signedOut = await send(browser, 'DELETE', '/api/v1/auth/session')
    assert.equal(signedOut.status, 204, signedOut.text)
  }).timeout(30_000)

  test('T-SEC-011 an admin call is charged to api_staff, not api_user', async ({ assert }) => {
    const staff = await account('api-staff')
    const staffId = staff.id
    ids.push(staffId)
    // An enrolled platform admin; a placeholder secret stands in, as in courier_http.ts.
    await db
      .from('users')
      .where('id', staffId)
      .update({ mfa_enabled_at: db.raw('now()'), mfa_totp_secret_enc: placeholderCiphertext() })
    await db.table('platform_staff').insert({ user_id: staffId, role: 'platform_admin' })
    const browser = await signIn(staffId, minutesAgo(1))
    const path = '/api/v1/admin/logistics/accounts'

    await useUp('api_user', staffId, 300)
    const allowed = await send(browser, 'GET', path)
    assert.equal(allowed.status, 200, allowed.text)

    await useUp('api_staff', staffId, 600)
    const refused = await send(browser, 'GET', path)
    assert.equal(refused.status, 429, refused.text)
    assert.equal(refused.body.code, 'RATE_LIMITED')
  }).timeout(30_000)
})

import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import { CookieClient } from '@adonisjs/core/http'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { clientNetwork, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import type { Browser } from '#tests/support/browser'
import {
  LOG_IN_PATH,
  forgetLogin,
  guest,
  postJson,
  randomIPv4,
  type Guest,
} from '#tests/support/identity'

/*
 * T-SEC-011 through `logIn` over HTTP (docs/06 §9.1, docs/07 §3.6; M1
 * part 3), where real commits matter: the limiter store writes
 * `rate_limits` on its own connection (docs/10 §3.3). The limiter itself
 * (the parallel case, the IPv6 /64, `login_ip`) is tested on
 * `throttledLogin` in login_throttle.spec.ts.
 * - Five wrong passwords for one account and client network, then the
 *   sixth attempt, even with the right password, gets 429 `RATE_LIMITED`
 *   with `Retry-After`, signs nobody in and writes no audit row: it never
 *   reached the check (docs/04a §15.3).
 * - A sign-in deletes the account key, so only failures count.
 * Each test uses a fresh account under its own prefix and a fresh client
 * network, then deletes the account, its audit rows (as the migrator, with
 * the retention exemption), the session rows its requests made and its
 * limiter keys.
 */

const PREFIX = 'conc-login-'
const cookies = new CookieClient(encryption.use())

function sessionIdOf(browser: Browser) {
  const value = browser.cookie('dripnepal_session')
  return value ? (cookies.unsign('dripnepal_session', decodeURIComponent(value)) as string) : null
}

async function cleanUp(sessionIds: Set<string>) {
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    const users = await trx.from('users').where('email', 'like', `${PREFIX}%`).select('id')
    const ids = users.map((user) => user.id as string)
    if (ids.length > 0) {
      await trx.from('sessions').whereIn('user_id', ids).delete()
      await trx.from('audit_logs').whereIn('subject_id', ids).delete()
      await trx.from('users').whereIn('id', ids).delete()
    }
    if (sessionIds.size > 0)
      await trx
        .from('sessions')
        .whereIn('id', [...sessionIds])
        .delete()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

test.group('T-SEC-011 login throttling through logIn', (group) => {
  let sessionIds: Set<string>
  let emails: { email: string; ip: string }[]
  group.each.setup(() => {
    sessionIds = new Set()
    emails = []
    return async () => {
      for (const { email, ip } of emails) await forgetLogin(email, ip)
      await cleanUp(sessionIds)
    }
  })

  async function attempt(client: Guest, email: string, password: string) {
    const response = await postJson(client, LOG_IN_PATH, { email, password })
    const id = sessionIdOf(client.browser)
    if (id) sessionIds.add(id)
    return response
  }

  const account = () =>
    UserFactory.merge({ email: `${PREFIX}${randomUUID()}@example.com` }).create()

  test('T-SEC-011 five wrong passwords, then 429 RATE_LIMITED with Retry-After even for the right password, with no session and no row for the refusal [AC-FR-IAM-003-3, AC-J04-08]', async ({
    assert,
  }) => {
    const user = await account()
    const client = await guest(randomIPv4())
    emails.push({ email: user.email, ip: client.ip })

    for (let n = 0; n < 5; n++) {
      const wrong = await attempt(client, user.email, `${FACTORY_PASSWORD}-${n}`)
      assert.equal(wrong.status, 401, wrong.text)
    }
    const limited = await attempt(client, user.email, FACTORY_PASSWORD)
    assert.equal(limited.status, 429, limited.text)
    assert.equal(limited.body.code, 'RATE_LIMITED')
    const retryAfter = Number(limited.headers.get('retry-after'))
    assert.isAbove(retryAfter, 0)
    assert.isAtMost(retryAfter, 60)
    assert.equal(limited.body.retry_after_seconds, retryAfter)

    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)
    const rows = await db.from('audit_logs').where('subject_id', user.id)
    assert.sameMembers(
      rows.map((row) => row.action),
      Array.from({ length: 5 }, () => 'auth.login_failed')
    )
  }).timeout(30_000)

  test('T-SEC-011 a sign-in through logIn deletes the account key, so only failures count', async ({
    assert,
  }) => {
    const user = await account()
    const client = await guest(randomIPv4())
    emails.push({ email: user.email, ip: client.ip })

    for (let n = 0; n < 4; n++) {
      const wrong = await attempt(client, user.email, `wrong-${n}`)
      assert.equal(wrong.status, 401, wrong.text)
    }
    const signedIn = await attempt(client, user.email, FACTORY_PASSWORD)
    assert.equal(signedIn.status, 200, signedIn.text)
    const key = rateLimitKey('login_acct_ip', user.email, clientNetwork(client.ip))
    assert.isNull(await rateLimiter('login_acct_ip').get(key))
  }).timeout(30_000)
})

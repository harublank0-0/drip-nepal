import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import { MessageBuilder } from '@adonisjs/core/helpers'
import User from '#models/user'
import { middleware } from '#start/kernel'
import { startSession } from '#controllers/support/session'
import { UserFactory } from '#database/factories/user_factory'
import { testBrowser, type Browser } from '#tests/support/browser'

/*
 * Sessions and the per-request account check over HTTP, on the database
 * session store (docs/07 §3.1 to §3.3, ADR-0005):
 * - T-SEC-010: a suspended, deactivated or anonymized user's next request
 *   is refused with 403 `ACCOUNT_SUSPENDED` (API) or a redirect to /login
 *   (page) while the session row exists, and 401 `UNAUTHENTICATED` once the
 *   row is gone; a stamp-only mismatch and a session past the 30-day
 *   absolute limit are 401. Deleting the user's rows stands in for the
 *   `identity.revoke_sessions` job, which M1 builds.
 * - T-SEC-009, the E7 part: the cookie attributes, the tag after sign-in,
 *   and the store's 7-day and 2 h expiries for `write` and `touch`.
 *
 * Signing in uses `startSession`, the helper the M1 `logIn` controller
 * calls, from a route that exists only in this test run.
 */

router
  .group(() => {
    router.get('sign-in/:id', async (ctx) => {
      const user = await User.findOrFail(ctx.params.id)
      await startSession(ctx, user, user.securityStamp)
      const { authenticated_at: authenticatedAt, forget } = ctx.request.qs()
      if (typeof authenticatedAt === 'string') ctx.session.put('authenticated_at', authenticatedAt)
      if (typeof forget === 'string') ctx.session.forget(forget)
      return { session_id: ctx.session.sessionId }
    })
    router.get('flash', ({ session }) => session.flashMessages.all())
    // Changes the session data, so the response writes the session instead of touching it.
    router.get('write', ({ session }) => {
      session.flash('notice', 'saved')
      return 'written'
    })
    router.get('account', () => 'account page').use(middleware.auth())
  })
  .prefix('/__test__/session')

router
  .group(() => {
    router.get('me', ({ auth }) => ({ user_id: auth.user!.id })).use(middleware.auth())
    router.post('me', () => ({ ok: true })).use(middleware.auth())
  })
  .prefix('/api/v1/__test__/session')

const DAY_MS = 24 * 60 * 60 * 1000

type SignedIn = { browser: Browser; user: User; sessionId: string }

async function signIn(state?: 'pending_verification', query = ''): Promise<SignedIn> {
  const user = state ? await UserFactory.apply(state).create() : await UserFactory.create()
  // `security_stamp` comes from the column default.
  await user.refresh()
  const browser = testBrowser()
  const response = await browser.request(`/__test__/session/sign-in/${user.id}${query}`)
  if (response.status !== 200) throw new Error(`sign-in answered ${response.status}`)
  const { session_id: sessionId } = (await response.json()) as { session_id: string }
  return { browser, user, sessionId }
}

async function problemOf(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

async function codeOf(response: Response) {
  const problem = await problemOf(response)
  return problem.code
}

const sessionRow = (id: string) => db.from('sessions').where('id', id).first()

// The row's values, as the store wrote them.
function sessionData(row: { id: string; data: string }) {
  return new MessageBuilder().verify<Record<string, unknown>>(row.data, row.id)
}

// The status changes of docs/07 §3.12, as the actions of M1 will write them.
const statusUpdates = {
  suspended: () => ({ status: 'suspended' }),
  deactivated: () => ({ status: 'deactivated', deletion_requested_at: new Date() }),
  anonymized: (id: string) => ({
    status: 'anonymized',
    anonymized_at: new Date(),
    email: `deleted-${id}@anonymized.invalid`,
    full_name: null,
    password_hash: null,
    phone_enc: null,
    phone_hash: null,
    phone_last4: null,
    age_confirmed_at: null,
    marketing_email_consent_at: null,
    marketing_sms_consent_at: null,
  }),
}

test.group('T-SEC-010 the per-request account check', () => {
  test('a signed-in active user is served', async ({ assert }) => {
    const { browser, user } = await signIn()
    const response = await browser.request('/api/v1/__test__/session/me')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { user_id: user.id })
  })

  test('a pending_verification user keeps the session', async ({ assert }) => {
    const { browser } = await signIn('pending_verification')
    const response = await browser.request('/api/v1/__test__/session/me')
    assert.equal(response.status, 200)
  })

  test('T-SEC-010 a {status} user gets 403 ACCOUNT_SUSPENDED, then 401 [AC-FR-IAM-006-2]')
    .with(['suspended', 'deactivated', 'anonymized'] as const)
    .run(async ({ assert }, status) => {
      const { browser, user, sessionId } = await signIn()
      const staleTab = browser.clone()
      await db.from('users').where('id', user.id).update(statusUpdates[status](user.id))

      const refused = await browser.request('/api/v1/__test__/session/me')
      assert.equal(refused.status, 403)
      const problem = await problemOf(refused)
      assert.equal(problem.code, 'ACCOUNT_SUSPENDED')
      assert.notProperty(problem, 'user_id')

      // Logged out, untagged, cleared and regenerated: the old row is gone.
      assert.isNull(await sessionRow(sessionId))
      assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)
      assert.notEqual(browser.cookie('dripnepal_session'), staleTab.cookie('dripnepal_session'))

      // The old cookie now finds no session: row 2 of 07 §3.3.
      const after = await staleTab.request('/api/v1/__test__/session/me')
      assert.equal(after.status, 401)
      assert.equal(await codeOf(after), 'UNAUTHENTICATED')
    })

  test('T-SEC-010 a suspended user is refused on an unsafe call too', async ({ assert }) => {
    const { browser, user } = await signIn()
    await db.from('users').where('id', user.id).update({ status: 'suspended' })
    const response = await browser.request('/api/v1/__test__/session/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert.equal(response.status, 403)
    assert.equal(await codeOf(response), 'ACCOUNT_SUSPENDED')
  })

  test('T-SEC-010 a suspended user on a page is sent to /login with the notice', async ({
    assert,
  }) => {
    const { browser, user } = await signIn()
    await db.from('users').where('id', user.id).update({ status: 'suspended' })
    const response = await browser.request('/__test__/session/account')
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), '/login')
    const flash = await browser.request('/__test__/session/flash')
    assert.deepEqual(await flash.json(), { notice: 'account_suspended' })
  })

  test('T-SEC-010 the status is checked before the stamp', async ({ assert }) => {
    // Suspension also rotates the stamp (07 §3.3): the user still learns why.
    const { browser, user } = await signIn()
    await db
      .from('users')
      .where('id', user.id)
      .update({ status: 'suspended', security_stamp: db.raw('gen_random_uuid()') })
    const response = await browser.request('/api/v1/__test__/session/me')
    assert.equal(response.status, 403)
    assert.equal(await codeOf(response), 'ACCOUNT_SUSPENDED')
  })

  test('T-SEC-010 a stamp-only mismatch is 401 and ends the session', async ({ assert }) => {
    const { browser, user, sessionId } = await signIn()
    const staleTab = browser.clone()
    await db
      .from('users')
      .where('id', user.id)
      .update({ security_stamp: db.raw('gen_random_uuid()') })

    const response = await browser.request('/api/v1/__test__/session/me')
    assert.equal(response.status, 401)
    assert.equal(await codeOf(response), 'UNAUTHENTICATED')
    assert.isNull(await sessionRow(sessionId))

    const page = await staleTab.request('/__test__/session/account?tab=orders')
    assert.equal(page.status, 302)
    const location = new URL(page.headers.get('location')!, 'http://localhost')
    assert.equal(location.pathname, '/login')
    assert.equal(location.searchParams.get('return_to'), '/__test__/session/account?tab=orders')
  })

  test('T-SEC-010 a stamp mismatch on a page redirects to /login', async ({ assert }) => {
    const { browser, user } = await signIn()
    await db
      .from('users')
      .where('id', user.id)
      .update({ security_stamp: db.raw('gen_random_uuid()') })
    const page = await browser.request('/__test__/session/account')
    assert.equal(page.status, 302)
    assert.equal(new URL(page.headers.get('location')!, 'http://localhost').pathname, '/login')
  })

  test('T-SEC-010 after revocation the cookie gets 401 on GET and on POST with its old token', async ({
    assert,
  }) => {
    const { browser, user } = await signIn()
    await db.from('users').where('id', user.id).update({ status: 'suspended' })
    // What identity.revoke_sessions does: destroy every tagged row of the user.
    await db.from('sessions').where('user_id', user.id).delete()

    const read = await browser.clone().request('/api/v1/__test__/session/me')
    assert.equal(read.status, 401)
    assert.equal(await codeOf(read), 'UNAUTHENTICATED')

    // The X-XSRF-TOKEN was made from the destroyed session's secret.
    const write = await browser.clone().request('/api/v1/__test__/session/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert.equal(write.status, 401)
    assert.equal(await codeOf(write), 'UNAUTHENTICATED')

    const page = await browser.clone().request('/__test__/session/account')
    assert.equal(page.status, 302)
    assert.equal(new URL(page.headers.get('location')!, 'http://localhost').pathname, '/login')
  })

  test('T-SEC-010 a session past the 30-day absolute limit is 401', async ({ assert }) => {
    const old = new Date(Date.now() - 31 * DAY_MS).toISOString()
    const { browser, sessionId } = await signIn(undefined, `?authenticated_at=${old}`)
    const response = await browser.request('/api/v1/__test__/session/me')
    assert.equal(response.status, 401)
    assert.equal(await codeOf(response), 'UNAUTHENTICATED')
    assert.isNull(await sessionRow(sessionId))
  })

  test('T-SEC-010 a session inside the 30-day limit is served', async ({ assert }) => {
    const recent = new Date(Date.now() - 29 * DAY_MS).toISOString()
    const { browser } = await signIn(undefined, `?authenticated_at=${recent}`)
    const response = await browser.request('/api/v1/__test__/session/me')
    assert.equal(response.status, 200)
  })

  test('T-SEC-010 a session without {key} is 401')
    .with(['authenticated_at', 'security_stamp'])
    .run(async ({ assert }, key) => {
      const { browser } = await signIn(undefined, `?forget=${key}`)
      const response = await browser.request('/api/v1/__test__/session/me')
      assert.equal(response.status, 401)
      assert.equal(await codeOf(response), 'UNAUTHENTICATED')
    })
})

test.group('T-SEC-009 session store and cookie (E7 part)', () => {
  test('sign-in sets the dripnepal_session cookie with the 07 §3.1 attributes', async ({
    assert,
  }) => {
    const user = await UserFactory.create()
    const response = await testBrowser().request(`/__test__/session/sign-in/${user.id}`)
    const cookie = response.headers.getSetCookie().find((c) => c.startsWith('dripnepal_session='))
    assert.isDefined(cookie)
    const attributes = cookie!
      .split(';')
      .slice(1)
      .map((part) => part.trim().toLowerCase())
    assert.includeMembers(attributes, ['max-age=604800', 'path=/', 'httponly', 'samesite=lax'])
    // Host-only, and not Secure outside staging and production (APP_ENV=test).
    assert.isUndefined(attributes.find((part) => part.startsWith('domain=')))
    assert.notInclude(attributes, 'secure')
  })

  test('a signed-in session is tagged and kept 7 days; its data holds the stamp', async ({
    assert,
  }) => {
    const { user, sessionId } = await signIn()
    const row = await sessionRow(sessionId)
    assert.equal(row.user_id, user.id)
    assert.closeTo(new Date(row.expires_at).getTime(), Date.now() + 7 * DAY_MS, 60_000)
    const data = sessionData(row)!
    assert.equal(data.auth_web, user.id)
    assert.equal(data.security_stamp, user.securityStamp)
    assert.isString(data.authenticated_at)
  })

  test("a guest's session row expires after 2 h", async ({ assert }) => {
    const browser = testBrowser()
    const before = await db.from('sessions').select('id')
    await browser.request('/__test__/session/flash')
    const rows = await db.from('sessions').whereNotIn(
      'id',
      before.map((row) => row.id)
    )
    assert.lengthOf(rows, 1)
    assert.isNull(rows[0].user_id)
    assert.closeTo(new Date(rows[0].expires_at).getTime(), Date.now() + 2 * 60 * 60 * 1000, 60_000)
  })

  test('touch extends a tagged row by 7 days and an untagged one by 2 h', async ({ assert }) => {
    const { browser, sessionId } = await signIn()
    const soon = new Date(Date.now() + 60_000)

    // An unchanged session is touched, not written: the tag decides.
    await db.from('sessions').where('id', sessionId).update({ expires_at: soon })
    await browser.request('/api/v1/__test__/session/me')
    const tagged = await sessionRow(sessionId)
    assert.closeTo(new Date(tagged.expires_at).getTime(), Date.now() + 7 * DAY_MS, 60_000)

    // The row that lost its tag to the revocation race of 07 §3.3.
    await db.from('sessions').where('id', sessionId).update({ expires_at: soon, user_id: null })
    const response = await browser.request('/api/v1/__test__/session/me')
    assert.equal(response.status, 200)
    const untagged = await sessionRow(sessionId)
    assert.closeTo(new Date(untagged.expires_at).getTime(), Date.now() + 2 * 60 * 60 * 1000, 60_000)
  })

  test('write extends a tagged row by 7 days and an untagged one by 2 h', async ({ assert }) => {
    const { browser, sessionId } = await signIn()
    const soon = new Date(Date.now() + 60_000)

    await db.from('sessions').where('id', sessionId).update({ expires_at: soon })
    await browser.request('/__test__/session/write')
    const tagged = await sessionRow(sessionId)
    assert.closeTo(new Date(tagged.expires_at).getTime(), Date.now() + 7 * DAY_MS, 60_000)

    // Signed in but untagged (07 §3.3): a write does not restore 7 days.
    await db.from('sessions').where('id', sessionId).update({ expires_at: soon, user_id: null })
    const response = await browser.request('/__test__/session/write')
    assert.equal(response.status, 200)
    const untagged = await sessionRow(sessionId)
    // It was a write: the data holds the flash message and the signed-in user.
    const data = sessionData(untagged)!
    assert.deepEqual(data.__flash__, { notice: 'saved' })
    assert.isString(data.auth_web)
    assert.closeTo(new Date(untagged.expires_at).getTime(), Date.now() + 2 * 60 * 60 * 1000, 60_000)
  })
})

import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { ShopFactory } from '#database/factories/shop_factory'
import { DEMO_EMAIL_DOMAIN } from '#modules/identity/queries'
import { developmentOnlyRefusal } from '#modules/platform/development_only'
import { testBrowser, type Browser } from '#tests/support/browser'
import { staffUser } from '#tests/support/courier_http'

/*
 * T-SEC-044, the development-only sign-in (docs/07 §3.13). Guard 1, the
 * production route list, is T-UI-026. Guard 2 reads this process's
 * environment and database, which a test cannot change, so its rule is
 * tested on the function the controller calls. Guard 3 and what the sign-in
 * writes are tested over HTTP.
 */

let sequence = 0
const demoEmail = () => `t-sec-044-${(sequence += 1)}@${DEMO_EMAIL_DOMAIN}`

async function otherUser() {
  const user = await UserFactory.create()
  return user.id
}

async function demoUser(status?: 'suspended') {
  const builder = UserFactory.merge({ email: demoEmail() })
  const user = await (status ? builder.apply(status) : builder).create()
  return user.id
}

async function staffWithoutTotp() {
  const user = await UserFactory.create()
  await db.table('platform_staff').insert({ user_id: user.id, role: 'platform_admin' })
  return user.id
}

async function revokedStaff() {
  const userId = await staffUser('platform_admin')
  const revoker = await UserFactory.create()
  await db
    .from('platform_staff')
    .where('user_id', userId)
    .update({ revoked_at: db.raw('now()'), revoked_by: revoker.id })
  return userId
}

async function openSignIn() {
  const browser = testBrowser()
  await browser.open('/dev/sign-in')
  return browser
}

async function signInPage(browser: Browser) {
  return (await browser.props('/dev/sign-in')) as {
    accounts: { id: string; staff_role: string | null }[]
    staff_without_totp: number
    signed_in_as: string | null
  }
}

async function signedInAs(browser: Browser) {
  const page = await signInPage(browser)
  return page.signed_in_as
}

async function answer(browser: Browser, method: string, path: string) {
  const response = await browser.request(path, {
    method,
    headers: { Accept: 'application/json' },
  })
  await response.arrayBuffer()
  return response.status
}

test.group('T-SEC-044 development-only sign-in', () => {
  test('T-SEC-044 guard 2 refuses production, APP_ENV {appEnv} and other databases')
    .with([{ appEnv: 'staging' }, { appEnv: 'production' }])
    .run(({ assert }, { appEnv }) => {
      const here = { inProduction: false, appEnv: 'development', databaseName: 'dripnepal_dev' }
      const subject = 'the development sign-in'
      assert.isNull(developmentOnlyRefusal(here, subject))
      assert.isNull(developmentOnlyRefusal({ ...here, databaseName: 'dripnepal_test' }, subject))
      assert.equal(
        developmentOnlyRefusal({ ...here, appEnv }, subject),
        `the development sign-in refuse APP_ENV=${appEnv}`
      )
      assert.isString(developmentOnlyRefusal({ ...here, inProduction: true }, subject))
      for (const databaseName of ['dripnepal', 'dripnepal_staging', 'dripnepal_dev_old']) {
        assert.isString(developmentOnlyRefusal({ ...here, databaseName }, subject))
      }
    })

  test('T-SEC-044 offers active demo accounts and staff with TOTP, nobody else', async ({
    assert,
  }) => {
    const demo = await demoUser()
    const staff = await staffUser('support_agent')
    const hidden = [
      await demoUser('suspended'),
      await otherUser(),
      await staffWithoutTotp(),
      await revokedStaff(),
    ]

    const page = await signInPage(await openSignIn())
    const ids = page.accounts.map((account) => account.id)
    assert.includeMembers(ids, [demo, staff])
    for (const id of hidden) assert.notInclude(ids, id)
    assert.equal(page.accounts.find((account) => account.id === staff)?.staff_role, 'support_agent')
    assert.equal(page.staff_without_totp, 1)
    assert.isNull(page.signed_in_as)
  })

  test('T-SEC-044 answers 404 for {name}')
    .with([
      { name: 'an unknown ID', make: async () => randomUUID() },
      { name: 'a suspended demo account', make: () => demoUser('suspended') },
      {
        name: 'an account outside the demo domain',
        make: otherUser,
      },
      { name: 'staff without TOTP', make: staffWithoutTotp },
      { name: 'revoked staff', make: revokedStaff },
    ])
    .run(async ({ assert }, { make }) => {
      const id = await make()
      const browser = await openSignIn()
      assert.equal(await answer(browser, 'POST', `/dev/sign-in/${id}`), 404)
      assert.isNull(await signedInAs(browser))
    })

  test('T-SEC-044 signs a demo account in as logIn will, without the staff MFA time', async ({
    assert,
  }) => {
    const owner = await demoUser()
    const shop = await ShopFactory.merge({ ownerUserId: owner }).apply('active').create()
    const before = await db.from('users').where('id', owner).first()
    const audits = await db.from('audit_logs').count('* as total').first()

    const browser = await openSignIn()
    const response = await browser.request(`/dev/sign-in/${owner}`, { method: 'POST' })
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), '/dev/sign-in')

    assert.equal(await signedInAs(browser), before.email)
    // The seller context accepts the session; the admin API does not exist for it.
    assert.equal(await answer(browser, 'GET', `/api/v1/seller/shops/${shop.slug}/logistics`), 200)
    assert.equal(await answer(browser, 'GET', '/api/v1/admin/logistics/accounts'), 404)

    // Nothing but the session is written.
    const after = await db.from('users').where('id', owner).first()
    assert.deepEqual(after, before)
    assert.deepEqual(await db.from('audit_logs').count('* as total').first(), audits)
  })

  test('T-SEC-044 records the MFA time for staff, so the admin API opens', async ({ assert }) => {
    const staff = await staffUser('platform_admin')
    const browser = await openSignIn()
    assert.equal(await answer(browser, 'GET', '/api/v1/admin/logistics/accounts'), 401)

    await browser.request(`/dev/sign-in/${staff}`, { method: 'POST' })
    assert.equal(await answer(browser, 'GET', '/api/v1/admin/logistics/accounts'), 200)
  })

  test('T-SEC-044 sign-out ends the session', async ({ assert }) => {
    const staff = await staffUser('platform_admin')
    const browser = await openSignIn()
    await browser.request(`/dev/sign-in/${staff}`, { method: 'POST' })
    assert.equal(await answer(browser, 'GET', '/api/v1/admin/logistics/accounts'), 200)

    const response = await browser.request('/dev/sign-out', { method: 'POST' })
    assert.equal(response.status, 302)
    assert.equal(await answer(browser, 'GET', '/api/v1/admin/logistics/accounts'), 401)
    assert.isNull(await signedInAs(browser))
  })
})

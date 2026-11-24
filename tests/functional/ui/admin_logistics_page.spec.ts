import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { encryptField } from '#modules/platform/crypto/field_encrypter'
import { ShopFactory } from '#database/factories/shop_factory'
import { NCM_TOKEN, insertNcmAccount } from '#tests/support/courier'
import { UserFactory } from '#database/factories/user_factory'
import { minutesAgo, signIn, staffUser, statusOf } from '#tests/support/courier_http'
import { testBrowser, type Browser } from '#tests/support/browser'

/*
 * The admin courier accounts page, `/admin/logistics` (docs/08 §2.6, §3.1;
 * docs/07 §4.5 page requirement `platform.logistics.manage`):
 * - T-SEC-030, its access matrix: a guest is sent to sign in, a signed-in
 *   user who is not staff gets the 404 page, staff without fresh MFA are
 *   sent to verify it, staff without the permission get 403;
 * - T-SEC-036, its prop key set, and T-SEC-040, no credentials in it;
 * - T-UI-035 (proposed), what it lists: every account with its owner, status
 *   and allowed shops by name, one cursor page at a time;
 * - the shared props `user` and `current_staff` (docs/09 §13.7).
 */

const PAGE = '/admin/logistics'

async function htmlStatus(browser: Browser, path: string) {
  const response = await browser.request(path, { headers: { Accept: 'text/html' } })
  await response.arrayBuffer()
  return { status: response.status, location: response.headers.get('location') }
}

// The Inertia page object of an HTML answer, whatever its status.
async function htmlPage(browser: Browser, path: string) {
  const response = await browser.request(path, { headers: { Accept: 'text/html' } })
  const html = await response.text()
  const json = /<script data-page="app" type="application\/json">([^<]*)<\/script>/.exec(html)?.[1]
  return {
    status: response.status,
    page: JSON.parse(json ?? 'null') as {
      component: string
      props: Record<string, unknown>
    } | null,
  }
}

async function adminBrowser() {
  return signIn(await staffUser('platform_admin'), minutesAgo(1))
}

async function pageProps(browser: Browser, path = PAGE) {
  await browser.open(path)
  return browser.props(path)
}

async function platformAccount(name: string) {
  const [row] = await db
    .table('logistics_accounts')
    .insert({
      provider_code: 'ncm',
      owner_type: 'platform',
      shop_id: null,
      name,
      environment: 'sandbox',
      credentials_enc: encryptField(
        JSON.stringify({ token: NCM_TOKEN }),
        'logistics_accounts.credentials_enc'
      ),
      status: 'active',
      verified_at: db.raw('now()'),
    })
    .returning('id')
  return row.id as string
}

async function allow(accountId: string, shopId: string, isActive = true) {
  await db.table('logistics_account_shops').insert({
    account_id: accountId,
    shop_id: shopId,
    account_owner_type: 'platform',
    owner_shop_id: null,
    is_active: isActive,
    disabled_at: isActive ? null : db.raw('now()'),
  })
}

type Account = {
  id: string
  name: string
  owner_type: string
  status: string
  shop: { shop_id: string; slug: string | null; name: string | null } | null
  shops: { shop_id: string; slug: string | null; name: string | null; is_active: boolean }[]
  needs_totp_code: boolean
}

test.group('T-SEC-030 /admin/logistics access', () => {
  test('T-SEC-030 a guest is sent to sign in', async ({ assert }) => {
    const answer = await htmlStatus(testBrowser(), PAGE)
    assert.equal(answer.status, 302)
    assert.match(answer.location ?? '', /^\/login/)
  })

  test('T-SEC-030 a signed-in user who is not staff gets the 404 page', async ({ assert }) => {
    const user = await UserFactory.create()
    const browser = await signIn(user.id)
    assert.equal(await statusOf(htmlStatus(browser, PAGE)), 404)
  })

  test('T-SEC-030 staff without fresh MFA are sent to verify it', async ({ assert }) => {
    const browser = await signIn(await staffUser('platform_admin'), minutesAgo(13 * 60))
    const answer = await htmlStatus(browser, PAGE)
    assert.equal(answer.status, 302)
    assert.match(answer.location ?? '', /^\/mfa/)
  })

  test('T-SEC-030 staff without the permission get 403, PermissionDenied in the admin layout', async ({
    assert,
  }) => {
    const browser = await signIn(await staffUser('support_agent'), minutesAgo(1))
    const { status, page } = await htmlPage(browser, PAGE)
    assert.equal(status, 403)
    assert.equal(page?.component, 'admin/forbidden')
    // The navigation shows what the role can use.
    assert.deepEqual(page?.props.current_staff, {
      role: 'support_agent',
      permissions: ['platform.orders.intervene'],
    })
  })

  test('T-SEC-030 a CSRF failure on a page is redirected back, never the role page', async ({
    assert,
  }) => {
    // Shield's CSRF error handles itself with a redirect back, so it never reaches the
    // status pages; the handler also gates the role page on a thrown FORBIDDEN DomainError.
    // The one page-route write today is the development sign-out (docs/07 §3.13).
    const browser = await adminBrowser()
    const response = await browser.request('/dev/sign-out', {
      method: 'POST',
      headers: { 'Accept': 'text/html', 'X-XSRF-TOKEN': 'stale' },
    })
    const html = await response.text()
    assert.equal(response.status, 302)
    assert.notInclude(html, 'forbidden')
    // The session survives: the admin page still opens.
    assert.equal(await statusOf(htmlStatus(browser, PAGE)), 200)
  })

  test('T-SEC-030 a platform admin opens it', async ({ assert }) => {
    assert.equal(await statusOf(htmlStatus(await adminBrowser(), PAGE)), 200)
  })
})

test.group('T-SEC-036 /admin/logistics props', () => {
  test('T-SEC-036 the page sends the shared props and the accounts, nothing else', async ({
    assert,
  }) => {
    const shop = await ShopFactory.apply('active').create()
    await insertNcmAccount(shop.id)
    const props = await pageProps(await adminBrowser())
    assert.sameMembers(Object.keys(props), [
      'errors',
      'flash',
      'support',
      'appUrl',
      'theme',
      'user',
      'current_staff',
      'seller_shops',
      'current_shop',
      'request_id',
      'accounts',
    ])
    const accounts = props.accounts as { items: Record<string, unknown>[]; meta: object }
    assert.sameMembers(Object.keys(accounts), ['items', 'meta'])
    assert.sameMembers(Object.keys(accounts.items[0]), [
      'id',
      'provider_code',
      'owner_type',
      'name',
      'environment',
      'external_account_ref',
      'status',
      'verified_at',
      'disabled_at',
      'version',
      'shop',
      'shops',
      'needs_totp_code',
    ])
  })

  test('T-SEC-040 no credential reaches the page', async ({ assert }) => {
    const shop = await ShopFactory.apply('active').create()
    await insertNcmAccount(shop.id)
    await platformAccount('DripNepal NCM')
    const stored = await db.from('logistics_accounts').select('credentials_enc')
    const text = JSON.stringify(await pageProps(await adminBrowser()))
    assert.notInclude(text, 'credentials')
    assert.notInclude(text, NCM_TOKEN)
    for (const row of stored) assert.notInclude(text, row.credentials_enc)
  })

  test('T-SEC-036 current_staff names the role and its permissions, on admin pages only', async ({
    assert,
  }) => {
    const browser = await adminBrowser()
    const props = await pageProps(browser)
    assert.deepEqual(props.current_staff, {
      role: 'platform_admin',
      permissions: ['platform.orders.intervene', 'platform.logistics.manage'],
    })
    assert.match(String((props.user as { email: string }).email), /@/)

    const elsewhere = await pageProps(browser, '/dev/sign-in')
    assert.isNull(elsewhere.current_staff)
    assert.deepEqual(elsewhere.user, props.user)
  })
})

test.group('T-UI-035 /admin/logistics lists the courier accounts', () => {
  test('T-UI-035 each account with its owner, status and allowed shops by name', async ({
    assert,
  }) => {
    const owner = await ShopFactory.apply('active').create()
    const allowed = await ShopFactory.apply('active').create()
    const removed = await ShopFactory.apply('active').create()
    const own = await insertNcmAccount(owner.id, { status: 'pending', verified_at: null })
    const platform = await platformAccount('DripNepal NCM')
    await allow(platform, allowed.id)
    await allow(platform, removed.id, false)

    const props = await pageProps(await adminBrowser())
    const items = (props.accounts as { items: Account[] }).items
    const byId = new Map(items.map((item) => [item.id, item]))

    const shopOwned = byId.get(own)!
    assert.equal(shopOwned.status, 'pending')
    assert.deepEqual(shopOwned.shop, { shop_id: owner.id, slug: owner.slug, name: owner.name })

    const ours = byId.get(platform)!
    assert.isNull(ours.shop)
    assert.sameDeepMembers(ours.shops, [
      { shop_id: allowed.id, slug: allowed.slug, name: allowed.name, is_active: true },
      { shop_id: removed.id, slug: removed.slug, name: removed.name, is_active: false },
    ])
    assert.isFalse(shopOwned.needs_totp_code, 'another person’s shop')
    assert.isFalse(ours.needs_totp_code)
  })

  test('T-SEC-045 an account of the staff member’s own shop needs a code only under single-operator mode', async ({
    assert,
  }) => {
    const setMode = (on: boolean) =>
      db.rawQuery(
        `INSERT INTO platform_settings (key, value) VALUES ('single_operator_mode', ?::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(on)]
      )
    const staffId = await staffUser('platform_admin')
    const owned = await ShopFactory.merge({ ownerUserId: staffId }).apply('active').create()
    const someoneElses = await ShopFactory.apply('active').create()
    const own = await insertNcmAccount(owned.id)
    const other = await insertNcmAccount(someoneElses.id)
    const platform = await platformAccount('DripNepal NCM')
    await allow(platform, owned.id)
    const browser = await signIn(staffId, minutesAgo(1))
    const needsCode = async () => {
      const props = await pageProps(browser)
      const items = (props.accounts as { items: Account[] }).items
      const of = (id: string) => items.find((item) => item.id === id)!.needs_totp_code
      return { own: of(own), other: of(other), platform: of(platform) }
    }
    await setMode(false)
    assert.deepEqual(
      await needsCode(),
      { own: false, other: false, platform: false },
      'mode off: the action answers 403 instead'
    )
    await setMode(true)
    assert.deepEqual(
      await needsCode(),
      { own: true, other: false, platform: false },
      'only the staff member’s own shop-owned account'
    )
  })

  test('T-UI-035 one cursor page at a time', async ({ assert }) => {
    const first = await platformAccount('First')
    const second = await platformAccount('Second')
    const browser = await adminBrowser()

    const page1 = await pageProps(browser, `${PAGE}?limit=1`)
    const one = page1.accounts as { items: Account[]; meta: { next_cursor: string | null } }
    assert.lengthOf(one.items, 1)
    assert.isString(one.meta.next_cursor)

    const cursor = encodeURIComponent(one.meta.next_cursor!)
    const page2 = await pageProps(browser, `${PAGE}?limit=1&cursor=${cursor}`)
    const two = page2.accounts as { items: Account[] }
    assert.sameMembers([one.items[0].id, two.items[0].id], [first, second])
  })
})

test.group('T-UI-035 /admin/logistics query parameters', () => {
  test('T-UI-035 an unknown or malformed parameter redirects to the page without it: {query}')
    .with([{ query: 'utm_source=newsletter' }, { query: 'cursor=stale' }, { query: 'limit=1000' }])
    .run(async ({ assert }, { query }) => {
      const answer = await htmlStatus(await adminBrowser(), `${PAGE}?${query}`)
      assert.equal(answer.status, 302)
      assert.equal(answer.location, PAGE)
    })
})

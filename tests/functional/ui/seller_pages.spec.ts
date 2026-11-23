import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import { send, signIn } from '#tests/support/courier_http'
import { insertEncryptedPickupAddress } from '#tests/support/courier'
import { insertLocation } from '#tests/support/schema_rows'
import { testBrowser, type Browser } from '#tests/support/browser'
import { sellerShopsOf } from '#middleware/inertia_middleware'
import { addMember, createOwnerShop, GRIEVANCE, setShopStatus } from '#tests/support/shops'

/*
 * The seller shell and overview, `/seller/{shopSlug}` (docs/08 §2.5; R1-S
 * part 1a). What the server decides is tested here; what the browser does
 * with it (the sidebar, the switcher's menu, focus) is checked in a browser.
 * - T-UI-039 (new): the overview opens for the owner and every active role,
 *   rendered in the browser (no server markup), never stored (`private,
 *   no-store`); a guest is sent to `/login` with the page as `return_to`;
 *   the `shop.member` gate refuses a `closed` shop and a non-owner of a
 *   `pending_review` or `rejected` one (403); the public header links "Your
 *   shop" only to a shop whose overview opens for the user, and for nobody
 *   else; a failed `seller_shops` read leaves the prop null and is logged
 *   without the error's text.
 * - T-SEC-001 case (a): a shop the caller is not in, by its slug, is the 404
 *   page of an unknown slug, and so is a removed member's shop.
 * - T-SEC-036: the overview sends the shared props and `checklist`; the
 *   shared `seller_shops` lists the caller's shops on every page and
 *   `current_shop` names the shop, the role and its permissions on seller
 *   pages only; no grievance contact reaches any prop.
 * - T-SEC-030, a gated page prop per role: the pickup address item is sent
 *   only to roles with `shop.shipping.manage`, the shipping item (R1-S part
 *   1c) to every role, and the permissions are the docs/07 §4.3 map's for
 *   the role.
 * - T-SEC-043: the overview and the settings page render with
 *   `encryptHistory`.
 * - T-UI-040 (new, R1-S part 1b): `/seller/{shopSlug}/settings` opens for
 *   the owner and every active role, rendered in the browser and never
 *   stored; a guest is sent to `/login`; the `shop.member` gate refuses a
 *   `closed` shop and a non-owner of a `pending_review` one. Its prop
 *   `shop` is `getSellerShop`'s answer for the member: the business
 *   details and the grievance contact for the owner only (T-SEC-036,
 *   T-SEC-034); another shop's settings are the 404 page (T-SEC-001).
 * - T-UI-041 (new, R1-S part 1c): `/seller/{shopSlug}/shipping` opens for
 *   the owner and every active role, rendered in the browser and never
 *   stored, with encrypted history; a guest is sent to `/login`; the
 *   `shop.member` gate refuses a `closed` shop and a non-owner of a
 *   `pending_review` one. Its props (T-SEC-036): `shipping`, what
 *   `getShopShipping` answers; `delivery_areas`, the 2 zones and the 77
 *   districts by province with the valley's three in `ktm_valley`; and
 *   `pickup_addresses`, with the contact phone in full and the place names,
 *   with `provinces` for the pickup form, only for roles with
 *   `shop.shipping.manage` while the shop is `active` (T-SEC-030). The overview's shipping and pickup items turn done after
 *   the shop saves its shipping and adds a pickup address through the API.
 *   Another shop's page is the 404 page (T-SEC-001).
 */

const SHARED_PROPS = [
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
]

const OWNER_PERMISSIONS = [
  'shop.profile.manage',
  'shop.shipping.manage',
  'shop.staff.manage',
  'shop.payout_account.manage',
  'shop.courier_accounts.manage',
  'shop.products.view',
  'shop.products.edit',
  'shop.products.publish',
  'shop.inventory.adjust',
  'shop.orders.view',
  'shop.orders.process',
  'shop.customer_contact.view',
  'shop.finance.view',
]

type Page = { component: string; props: Record<string, unknown>; encryptHistory?: boolean }

// An HTML answer with its Inertia page object, whatever its status.
async function htmlPage(browser: Browser, path: string) {
  const response = await browser.request(path, { headers: { Accept: 'text/html' } })
  const html = await response.text()
  const json = /<script data-page="app" type="application\/json">([^<]*)<\/script>/.exec(html)?.[1]
  return {
    status: response.status,
    headers: response.headers,
    html,
    page: JSON.parse(json ?? 'null') as Page | null,
  }
}

async function pageProps(browser: Browser, path: string) {
  await browser.open(path)
  return browser.props(path)
}

// A page's HTML with what differs between two requests taken out: the slug, the request ID, the nonce.
async function pageText(response: Response, slug: string) {
  const html = await response.text()
  let text = html.replaceAll(slug, '<slug>')
  const requestId = response.headers.get('x-request-id')
  if (requestId) text = text.replaceAll(requestId, '<request-id>')
  const nonce = /'nonce-([^']+)'/.exec(response.headers.get('content-security-policy') ?? '')?.[1]
  return nonce ? text.replaceAll(nonce, '<nonce>') : text
}

test.group('T-UI-039 the seller overview', () => {
  test('T-UI-039 the overview opens for the owner, rendered in the browser and never stored', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const browser = await signIn(shop.ownerId)
    const { status, headers, html, page } = await htmlPage(browser, `/seller/${shop.slug}`)
    assert.equal(status, 200)
    assert.equal(page?.component, 'seller/overview')
    assert.equal(headers.get('cache-control'), 'private, no-store')
    // Seller pages render in the browser (config/inertia.ts): no server markup.
    assert.notInclude(html, 'Before you can sell')
    assert.isTrue(page?.encryptHistory, 'T-SEC-043')
  })

  test('T-UI-039 every active role opens the overview: {role}')
    .with([
      { role: 'manager' },
      { role: 'catalog_editor' },
      { role: 'order_fulfiller' },
      { role: 'viewer' },
    ])
    .run(async ({ assert }, { role }) => {
      const shop = await createOwnerShop()
      const memberId = await addMember(shop.shopId, role)
      const { status, page } = await htmlPage(await signIn(memberId), `/seller/${shop.slug}`)
      assert.equal(status, 200)
      assert.equal(page?.component, 'seller/overview')
    })

  test('T-UI-039 a guest is sent to /login with the overview as return_to', async ({ assert }) => {
    const shop = await createOwnerShop()
    const response = await testBrowser().request(`/seller/${shop.slug}`, {
      headers: { Accept: 'text/html' },
    })
    await response.arrayBuffer()
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get('location') ?? '', 'http://localhost')
    assert.equal(location.pathname, '/login')
    assert.equal(location.searchParams.get('return_to'), `/seller/${shop.slug}`)
  })

  test('T-UI-039 the overview follows the shop.member gate: {status} for the {actor}')
    .with([
      { status: 'closed' as const, actor: 'owner', expected: 403 },
      { status: 'pending_review' as const, actor: 'owner', expected: 200 },
      { status: 'pending_review' as const, actor: 'manager', expected: 403 },
      { status: 'rejected' as const, actor: 'viewer', expected: 403 },
    ])
    .run(async ({ assert }, { status, actor, expected }) => {
      const shop = await createOwnerShop()
      const userId = actor === 'owner' ? shop.ownerId : await addMember(shop.shopId, actor)
      await setShopStatus(shop.shopId, status)
      const page = await htmlPage(await signIn(userId), `/seller/${shop.slug}`)
      assert.equal(page.status, expected)
    })

  test('T-UI-039 the public header links "Your shop" for a member only', async ({ assert }) => {
    const shop = await createOwnerShop()
    const memberId = await addMember(shop.shopId, 'viewer')
    for (const userId of [shop.ownerId, memberId]) {
      const { html } = await htmlPage(await signIn(userId), '/')
      assert.include(html, `href="/seller/${shop.slug}"`)
      assert.include(html, 'Your shop')
    }
    const stranger = await UserFactory.create()
    const strangerHome = await htmlPage(await signIn(stranger.id), '/')
    assert.notInclude(strangerHome.html, 'href="/seller/')
    const guestHome = await htmlPage(testBrowser(), '/')
    assert.notInclude(guestHome.html, 'href="/seller/')
  })

  test('T-UI-039 "Your shop" links only a shop whose overview opens: {status} for the {actor}')
    .with([
      { status: 'closed' as const, actor: 'owner', linked: false },
      { status: 'pending_review' as const, actor: 'owner', linked: true },
      { status: 'pending_review' as const, actor: 'manager', linked: false },
      { status: 'rejected' as const, actor: 'viewer', linked: false },
    ])
    .run(async ({ assert }, { status, actor, linked }) => {
      const shop = await createOwnerShop()
      const userId = actor === 'owner' ? shop.ownerId : await addMember(shop.shopId, actor)
      await setShopStatus(shop.shopId, status)
      const { html } = await htmlPage(await signIn(userId), '/')
      if (linked) assert.include(html, `href="/seller/${shop.slug}"`)
      else assert.notInclude(html, 'href="/seller/')
    })

  test('T-UI-039 a failed seller_shops read leaves the prop null instead of failing the page', async ({
    assert,
  }) => {
    const logged: Record<string, unknown>[] = []
    const logger = {
      error: (fields: Record<string, unknown>) => logged.push(fields),
    } as unknown as Parameters<typeof sellerShopsOf>[0]
    // Not a UUID, so PostgreSQL refuses the query (22P02): the read fails as a broken database would.
    assert.isNull(await sellerShopsOf(logger, 'not-a-uuid'))
    assert.deepEqual(logged, [
      { event: 'inertia.seller_shops_failed', error_class: 'DatabaseError', sql_state: '22P02' },
    ])
  })
})

test.group('T-SEC-001 (a) the seller pages answer 404 outside the caller’s shops', () => {
  test('T-SEC-001 another shop’s overview, or a removed member’s, is the 404 page of an unknown slug', async ({
    assert,
  }) => {
    const mine = await createOwnerShop()
    const theirs = await createOwnerShop()
    const browser = await signIn(mine.ownerId)
    const unknown = await browser.request('/seller/no-such-shop-anywhere', {
      headers: { Accept: 'text/html' },
    })
    assert.equal(unknown.status, 404)
    const expected = await pageText(unknown, 'no-such-shop-anywhere')
    const other = await browser.request(`/seller/${theirs.slug}`, {
      headers: { Accept: 'text/html' },
    })
    assert.equal(other.status, 404)
    assert.equal(await pageText(other, theirs.slug), expected)

    const removedId = await addMember(theirs.shopId, 'manager', 'removed')
    const removed = await htmlPage(await signIn(removedId), `/seller/${theirs.slug}`)
    assert.equal(removed.status, 404)
    assert.equal(removed.page?.component, 'errors/not_found')
  })
})

test.group('T-SEC-036 the seller overview props', () => {
  test('T-SEC-036 the overview sends the shared props and the checklist, never the grievance contact', async ({
    assert,
  }) => {
    const shop = await createOwnerShop({ name: 'Props Pasal' })
    const props = await pageProps(await signIn(shop.ownerId), `/seller/${shop.slug}`)
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'checklist'])
    assert.deepEqual(props.current_shop, {
      slug: shop.slug,
      name: 'Props Pasal',
      status: 'active',
      suspension_mode: null,
      role: 'owner',
      permissions: OWNER_PERMISSIONS,
    })
    assert.deepEqual(props.seller_shops, [
      { slug: shop.slug, name: 'Props Pasal', status: 'active', role: 'owner' },
    ])
    assert.deepEqual(props.checklist, [
      { item: 'seller_agreement', done: true },
      { item: 'shipping_rates', done: false },
      { item: 'pickup_address', done: false },
    ])
    const written = JSON.stringify(props)
    for (const secret of [GRIEVANCE.name, GRIEVANCE.phone, 'grievance', '_enc', shop.shopId]) {
      assert.notInclude(written, secret)
    }
  })

  test('T-SEC-036 seller_shops is on every page for a signed-in user, current_shop on seller pages only', async ({
    assert,
  }) => {
    const shop = await createOwnerShop({ name: 'Elsewhere Pasal' })
    const browser = await signIn(shop.ownerId)
    const account = await pageProps(browser, '/account')
    assert.deepEqual(account.seller_shops, [
      { slug: shop.slug, name: 'Elsewhere Pasal', status: 'active', role: 'owner' },
    ])
    assert.isNull(account.current_shop)
    const guest = await htmlPage(testBrowser(), '/')
    assert.isNull(guest.page?.props.seller_shops)
    assert.isNull(guest.page?.props.current_shop)
  })

  test('T-SEC-030 the checklist and permissions follow the role: {role}')
    .with([
      {
        role: 'manager',
        pickup: true,
        permissions: [
          'shop.profile.manage',
          'shop.shipping.manage',
          'shop.products.view',
          'shop.products.edit',
          'shop.products.publish',
          'shop.inventory.adjust',
          'shop.orders.view',
          'shop.orders.process',
          'shop.customer_contact.view',
          'shop.finance.view',
        ],
      },
      {
        role: 'catalog_editor',
        pickup: false,
        permissions: [
          'shop.products.view',
          'shop.products.edit',
          'shop.products.publish',
          'shop.inventory.adjust',
        ],
      },
      {
        role: 'order_fulfiller',
        pickup: false,
        permissions: [
          'shop.products.view',
          'shop.orders.view',
          'shop.orders.process',
          'shop.customer_contact.view',
        ],
      },
      { role: 'viewer', pickup: false, permissions: ['shop.products.view', 'shop.orders.view'] },
    ])
    .run(async ({ assert }, { role, pickup, permissions }) => {
      const shop = await createOwnerShop()
      await insertLocation()
      await insertEncryptedPickupAddress(shop.shopId)
      const memberId = await addMember(shop.shopId, role)
      const props = await pageProps(await signIn(memberId), `/seller/${shop.slug}`)
      const current = props.current_shop as { role: string; permissions: string[] }
      assert.equal(current.role, role)
      assert.deepEqual(current.permissions, permissions)
      // Every member reads the shipping (`getShopShipping`, `shop.member`); not set up here.
      assert.deepEqual(
        props.checklist,
        pickup
          ? [
              { item: 'seller_agreement', done: true },
              { item: 'shipping_rates', done: false },
              { item: 'pickup_address', done: true },
            ]
          : [
              { item: 'seller_agreement', done: true },
              { item: 'shipping_rates', done: false },
            ]
      )
    })
})

test.group('T-UI-040 the seller settings page', () => {
  const settingsPath = (slug: string) => `/seller/${slug}/settings`

  test('T-UI-040 the settings page opens for the owner, rendered in the browser and never stored', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const browser = await signIn(shop.ownerId)
    const { status, headers, html, page } = await htmlPage(browser, settingsPath(shop.slug))
    assert.equal(status, 200)
    assert.equal(page?.component, 'seller/settings')
    assert.equal(headers.get('cache-control'), 'private, no-store')
    // Seller pages render in the browser (config/inertia.ts): no server markup.
    assert.notInclude(html, 'Save settings')
    assert.isTrue(page?.encryptHistory, 'T-SEC-043')
  })

  test('T-UI-040 every active role opens the settings page: {role}')
    .with([
      { role: 'manager' },
      { role: 'catalog_editor' },
      { role: 'order_fulfiller' },
      { role: 'viewer' },
    ])
    .run(async ({ assert }, { role }) => {
      const shop = await createOwnerShop()
      const memberId = await addMember(shop.shopId, role)
      const { status, page } = await htmlPage(await signIn(memberId), settingsPath(shop.slug))
      assert.equal(status, 200)
      assert.equal(page?.component, 'seller/settings')
    })

  test('T-UI-040 a guest is sent to /login with the settings page as return_to', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const response = await testBrowser().request(settingsPath(shop.slug), {
      headers: { Accept: 'text/html' },
    })
    await response.arrayBuffer()
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get('location') ?? '', 'http://localhost')
    assert.equal(location.pathname, '/login')
    assert.equal(location.searchParams.get('return_to'), settingsPath(shop.slug))
  })

  test('T-UI-040 the settings page follows the shop.member gate: {status} for the {actor}')
    .with([
      { status: 'closed' as const, actor: 'owner', expected: 403 },
      { status: 'pending_review' as const, actor: 'owner', expected: 200 },
      { status: 'pending_review' as const, actor: 'manager', expected: 403 },
      { status: 'suspended' as const, actor: 'owner', expected: 200 },
    ])
    .run(async ({ assert }, { status, actor, expected }) => {
      const shop = await createOwnerShop()
      const userId = actor === 'owner' ? shop.ownerId : await addMember(shop.shopId, actor)
      await setShopStatus(shop.shopId, status)
      const page = await htmlPage(await signIn(userId), settingsPath(shop.slug))
      assert.equal(page.status, expected)
    })

  test('T-SEC-001 another shop’s settings page is the 404 page of an unknown slug', async ({
    assert,
  }) => {
    const mine = await createOwnerShop()
    const theirs = await createOwnerShop()
    const browser = await signIn(mine.ownerId)
    const unknown = await browser.request(settingsPath('no-such-shop-anywhere'), {
      headers: { Accept: 'text/html' },
    })
    assert.equal(unknown.status, 404)
    const expected = await pageText(unknown, 'no-such-shop-anywhere')
    const other = await browser.request(settingsPath(theirs.slug), {
      headers: { Accept: 'text/html' },
    })
    assert.equal(other.status, 404)
    assert.equal(await pageText(other, theirs.slug), expected)
  })

  test('T-SEC-036 the owner’s settings page sends the shared props and the shop as getSellerShop answers it', async ({
    assert,
  }) => {
    const shop = await createOwnerShop({ name: 'Settings Pasal' })
    const browser = await signIn(shop.ownerId)
    const props = await pageProps(browser, settingsPath(shop.slug))
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'shop'])
    const read = await send(browser, 'GET', `/api/v1/seller/shops/${shop.slug}`)
    assert.deepEqual(props.shop, read.body.data)
    const owned = props.shop as { grievance_contact: { name: string; phone: string } }
    // The owner reads the grievance phone decrypted (07 §5.5, T-SEC-034).
    assert.deepEqual(owned.grievance_contact, { name: GRIEVANCE.name, phone: GRIEVANCE.phone })
    assert.notInclude(JSON.stringify(props), '_enc')
  })

  test(
    'T-SEC-036 a {role}’s settings page holds no business details or grievance contact [AC-FR-SHOP-013-4]'
  )
    .with([{ role: 'manager' }, { role: 'viewer' }])
    .run(async ({ assert }, { role }) => {
      const shop = await createOwnerShop()
      const memberId = await addMember(shop.shopId, role)
      const props = await pageProps(await signIn(memberId), settingsPath(shop.slug))
      assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'shop'])
      const seen = props.shop as Record<string, unknown>
      assert.isNull(seen.business_details)
      assert.isNull(seen.grievance_contact)
      const written = JSON.stringify(props)
      for (const secret of [GRIEVANCE.name, GRIEVANCE.phone, '123456789', 'Returns within']) {
        assert.notInclude(written, secret)
      }
    })
})

test.group('T-UI-041 the seller shipping page', () => {
  const shippingPath = (slug: string) => `/seller/${slug}/shipping`
  const RATES = [
    { zone_code: 'ktm_valley', fee_minor: 10000, est_min_days: 0, est_max_days: 1 },
    { zone_code: 'outside_valley', fee_minor: 15000, est_min_days: 2, est_max_days: 5 },
  ]

  test('T-UI-041 the shipping page opens for the owner, rendered in the browser and never stored', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const browser = await signIn(shop.ownerId)
    const { status, headers, html, page } = await htmlPage(browser, shippingPath(shop.slug))
    assert.equal(status, 200)
    assert.equal(page?.component, 'seller/shipping')
    assert.equal(headers.get('cache-control'), 'private, no-store')
    // Seller pages render in the browser (config/inertia.ts): no server markup.
    assert.notInclude(html, 'Save delivery settings')
    assert.isTrue(page?.encryptHistory, 'T-SEC-043')
  })

  test('T-UI-041 every active role opens the shipping page: {role}')
    .with([
      { role: 'manager' },
      { role: 'catalog_editor' },
      { role: 'order_fulfiller' },
      { role: 'viewer' },
    ])
    .run(async ({ assert }, { role }) => {
      const shop = await createOwnerShop()
      const memberId = await addMember(shop.shopId, role)
      const { status, page } = await htmlPage(await signIn(memberId), shippingPath(shop.slug))
      assert.equal(status, 200)
      assert.equal(page?.component, 'seller/shipping')
    })

  test('T-UI-041 a guest is sent to /login with the shipping page as return_to', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const response = await testBrowser().request(shippingPath(shop.slug), {
      headers: { Accept: 'text/html' },
    })
    await response.arrayBuffer()
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get('location') ?? '', 'http://localhost')
    assert.equal(location.pathname, '/login')
    assert.equal(location.searchParams.get('return_to'), shippingPath(shop.slug))
  })

  test('T-UI-041 the shipping page follows the shop.member gate: {status} for the {actor}')
    .with([
      { status: 'closed' as const, actor: 'owner', expected: 403 },
      { status: 'pending_review' as const, actor: 'owner', expected: 200 },
      { status: 'pending_review' as const, actor: 'manager', expected: 403 },
      { status: 'suspended' as const, actor: 'owner', expected: 200 },
    ])
    .run(async ({ assert }, { status, actor, expected }) => {
      const shop = await createOwnerShop()
      const userId = actor === 'owner' ? shop.ownerId : await addMember(shop.shopId, actor)
      await setShopStatus(shop.shopId, status)
      const page = await htmlPage(await signIn(userId), shippingPath(shop.slug))
      assert.equal(page.status, expected)
    })

  test('T-SEC-001 another shop’s shipping page is the 404 page of an unknown slug', async ({
    assert,
  }) => {
    const mine = await createOwnerShop()
    const theirs = await createOwnerShop()
    const browser = await signIn(mine.ownerId)
    const unknown = await browser.request(shippingPath('no-such-shop-anywhere'), {
      headers: { Accept: 'text/html' },
    })
    assert.equal(unknown.status, 404)
    const expected = await pageText(unknown, 'no-such-shop-anywhere')
    const other = await browser.request(shippingPath(theirs.slug), {
      headers: { Accept: 'text/html' },
    })
    assert.equal(other.status, 404)
    assert.equal(await pageText(other, theirs.slug), expected)
  })

  test('T-SEC-036 the owner’s shipping page sends the shipping, the delivery areas and the pickup addresses', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    await insertLocation()
    await insertEncryptedPickupAddress(shop.shopId)
    const browser = await signIn(shop.ownerId)
    const props = await pageProps(browser, shippingPath(shop.slug))
    assert.sameMembers(Object.keys(props), [
      ...SHARED_PROPS,
      'shipping',
      'delivery_areas',
      'pickup_addresses',
      'provinces',
    ])
    // The pickup form's first step is every active province, as the address book's is.
    assert.lengthOf(props.provinces as unknown[], 7)
    const read = await send(browser, 'GET', `/api/v1/seller/shops/${shop.slug}/shipping`)
    assert.deepEqual(props.shipping, read.body.data)

    const areas = props.delivery_areas as {
      zones: { code: string; name: string }[]
      provinces: { code: string; districts: { code: string; zone_code: string }[] }[]
    }
    assert.deepEqual(areas.zones, [
      { code: 'ktm_valley', name: 'Kathmandu Valley' },
      { code: 'outside_valley', name: 'Outside Kathmandu Valley' },
    ])
    assert.lengthOf(areas.provinces, 7)
    const districts = areas.provinces.flatMap((province) => province.districts)
    assert.lengthOf(districts, 77)
    assert.sameMembers(
      districts.filter((district) => district.zone_code === 'ktm_valley').map((d) => d.code),
      ['306', '307', '308']
    )

    // The contact phone in full, as the shop's own data, with the place names (06 §13.8).
    const [address] = props.pickup_addresses as Record<string, unknown>[]
    assert.equal(address.contact_phone, '9812345678')
    assert.equal(address.area_tole, 'Thamel')
    assert.equal(address.district_name, 'Kathmandu')
    assert.equal(address.local_level_name, 'Kathmandu Metropolitan City')
    assert.equal(address.province_name, 'Bagmati')
    assert.isTrue(address.is_default)
    assert.notInclude(JSON.stringify(props), '_enc')
  })

  test('T-SEC-030 the pickup addresses and their provinces are left out for {label}')
    .with([
      { label: 'a viewer', role: 'viewer', status: null },
      { label: 'an order fulfiller', role: 'order_fulfiller', status: null },
      { label: 'the owner of a suspended shop', role: 'owner', status: 'suspended' as const },
      {
        label: 'the owner of a pending_review shop',
        role: 'owner',
        status: 'pending_review' as const,
      },
    ])
    .run(async ({ assert }, { role, status }) => {
      const shop = await createOwnerShop()
      await insertLocation()
      await insertEncryptedPickupAddress(shop.shopId)
      const userId = role === 'owner' ? shop.ownerId : await addMember(shop.shopId, role)
      if (status) await setShopStatus(shop.shopId, status)
      const props = await pageProps(await signIn(userId), shippingPath(shop.slug))
      assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'shipping', 'delivery_areas'])
      assert.notInclude(JSON.stringify(props), '9812345678')
    })

  test('T-UI-041 the overview’s shipping and pickup items turn done once they are saved', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const browser = await signIn(shop.ownerId)
    const saved = await send(
      browser,
      'PUT',
      `/api/v1/seller/shops/${shop.slug}/shipping`,
      { coverage: ['306', '405'], rates: RATES },
      { 'If-Match': '"1"' }
    )
    assert.equal(saved.status, 200, saved.text)
    const added = await send(
      browser,
      'POST',
      `/api/v1/seller/shops/${shop.slug}/pickup-addresses`,
      {
        label: 'Workshop',
        contact_name: 'Sita Fixture Rai',
        contact_phone: '014123456',
        province_code: '3',
        district_code: '306',
        local_level_code: '30608',
        ward_no: 4,
        area_tole: 'Fixture Tole',
        street_landmark: null,
      }
    )
    assert.equal(added.status, 201, added.text)
    assert.isTrue(added.body.data.is_default)

    const props = await pageProps(browser, `/seller/${shop.slug}`)
    assert.deepEqual(props.checklist, [
      { item: 'seller_agreement', done: true },
      { item: 'shipping_rates', done: true },
      { item: 'pickup_address', done: true },
    ])
    const page = await pageProps(browser, shippingPath(shop.slug))
    assert.isTrue((page.shipping as { configured: boolean }).configured)
    const [address] = page.pickup_addresses as Record<string, unknown>[]
    assert.equal(address.contact_phone, '014123456')
    assert.equal(address.postal_code, '3060804')
  })
})

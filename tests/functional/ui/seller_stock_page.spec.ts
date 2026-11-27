import { test } from '@japa/runner'
import { send, signIn } from '#tests/support/courier_http'
import { testBrowser, type Browser } from '#tests/support/browser'
import { useJobBoss } from '#tests/support/jobs'
import { create, draftBody, world } from '#tests/support/catalog'
import { addMember, createOwnerShop, setShopStatus } from '#tests/support/shops'

/*
 * T-UI-045 (docs/10 §6.9; R1-S part 2f-iv-a): the seller stock page,
 * `/seller/{shopSlug}/inventory`. Rendered in the browser and never stored;
 * gated as `listInventory` (`shop.products.view`, the `products_view`
 * gate); its props are the shared props, one page of `listInventory` and
 * the filters it read (T-SEC-036); a parameter the list refuses is dropped
 * by a redirect. The dialogs' rules are the unit cases of
 * tests/unit/ui/stock.spec.ts.
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

type Page = { component: string; props: Record<string, unknown>; encryptHistory?: boolean }

const stockPath = (slug: string) => `/seller/${slug}/inventory`

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

async function createdId(w: Awaited<ReturnType<typeof world>>, overrides = {}) {
  const response = await create(w, await draftBody(overrides))
  if (response.status !== 201) throw new Error(`createProduct answered ${response.status}`)
  return response.body.data.id as string
}

test.group('T-UI-045 the seller stock page', (group) => {
  // `createProduct` sends its listing job inside its transaction.
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-UI-045 the stock page opens for the owner, rendered in the browser and never stored', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const { status, headers, html, page } = await htmlPage(
      await signIn(shop.ownerId),
      stockPath(shop.slug)
    )
    assert.equal(status, 200)
    assert.equal(page?.component, 'seller/inventory')
    assert.equal(headers.get('cache-control'), 'private, no-store')
    // Seller pages render in the browser (config/inertia.ts): no server markup.
    assert.notInclude(html, 'What you hold of each variant')
    assert.isTrue(page?.encryptHistory, 'T-SEC-043')
  })

  test('T-UI-045 every active role opens the stock page: {role}')
    .with([
      { role: 'manager' },
      { role: 'catalog_editor' },
      { role: 'order_fulfiller' },
      { role: 'viewer' },
    ])
    .run(async ({ assert }, { role }) => {
      const shop = await createOwnerShop()
      const memberId = await addMember(shop.shopId, role)
      const { status, page } = await htmlPage(await signIn(memberId), stockPath(shop.slug))
      assert.equal(status, 200)
      assert.equal(page?.component, 'seller/inventory')
    })

  test('T-UI-045 a guest is sent to /login with the page as return_to', async ({ assert }) => {
    const shop = await createOwnerShop()
    const response = await testBrowser().request(stockPath(shop.slug), {
      headers: { Accept: 'text/html' },
    })
    await response.arrayBuffer()
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get('location') ?? '', 'http://localhost')
    assert.equal(location.pathname, '/login')
    assert.equal(location.searchParams.get('return_to'), stockPath(shop.slug))
  })

  test('T-SEC-031 the stock page follows the products_view gate: {status}')
    .with([
      { status: 'pending_review' as const, mode: null, expected: 403 },
      { status: 'rejected' as const, mode: null, expected: 403 },
      { status: 'closed' as const, mode: null, expected: 403 },
      { status: 'suspended' as const, mode: 'fulfill_existing' as const, expected: 200 },
      { status: 'suspended' as const, mode: 'frozen' as const, expected: 200 },
    ])
    .run(async ({ assert }, { status, mode, expected }) => {
      const shop = await createOwnerShop()
      await setShopStatus(shop.shopId, status, mode)
      const page = await htmlPage(await signIn(shop.ownerId), stockPath(shop.slug))
      assert.equal(page.status, expected)
    })

  test('T-SEC-001 another shop’s stock page is the 404 of an unknown slug', async ({ assert }) => {
    const mine = await createOwnerShop()
    const theirs = await createOwnerShop()
    const page = await htmlPage(await signIn(mine.ownerId), stockPath(theirs.slug))
    assert.equal(page.status, 404)
  })

  test('T-SEC-036 the stock page sends one page of listInventory and the filters it read', async ({
    assert,
  }) => {
    const w = await world()
    await createdId(w, { title: 'Organic cotton crew tee' })
    await createdId(w, { title: 'Linen shirt' })
    const props = await pageProps(w.owner, stockPath(w.shop.slug))
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'inventory', 'filters'])
    const api = await send(w.owner, 'GET', `/api/v1/seller/shops/${w.shop.slug}/inventory`)
    assert.deepEqual(props.inventory, { items: api.body.data, meta: api.body.meta })
    assert.lengthOf((props.inventory as { items: unknown[] }).items, 2)
    assert.deepEqual(props.filters, { status: null, q: null })
    const byTitle = await pageProps(w.owner, `${stockPath(w.shop.slug)}?q=organic&status=draft`)
    const titles = (byTitle.inventory as { items: { title: string }[] }).items.map(
      (item) => item.title
    )
    assert.deepEqual(titles, ['Organic cotton crew tee'])
    assert.deepEqual(byTitle.filters, { status: 'draft', q: 'organic' })
  })

  test('T-UI-045 a refused parameter redirects to the stock page without it: {label}')
    .with([
      { label: 'unknown status', query: '?status=paused&q=tee', expected: '?q=tee' },
      { label: 'unknown parameter', query: '?low_stock=true', expected: '' },
      { label: 'foreign cursor', query: '?status=draft&cursor=bm9wZQ', expected: '?status=draft' },
    ])
    .run(async ({ assert }, { query, expected }) => {
      const shop = await createOwnerShop()
      const browser = await signIn(shop.ownerId)
      const response = await browser.request(`${stockPath(shop.slug)}${query}`, {
        headers: { Accept: 'text/html' },
      })
      await response.arrayBuffer()
      assert.equal(response.status, 302)
      const location = new URL(response.headers.get('location') ?? '', 'http://localhost')
      assert.equal(`${location.pathname}${location.search}`, `${stockPath(shop.slug)}${expected}`)
    })
})

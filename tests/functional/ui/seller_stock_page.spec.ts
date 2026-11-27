import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
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
 * tests/unit/ui/stock.spec.ts. The variant's stock history page,
 * `/inventory/{variantId}` (R1-S part 2f-iv-b), is gated the same way and
 * names who made each change by role.
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

const historyPath = (slug: string, variantId: string) => `/seller/${slug}/inventory/${variantId}`

function adjustStock(w: Awaited<ReturnType<typeof world>>, variantId: string, delta: number) {
  return send(
    w.owner,
    'POST',
    `/api/v1/seller/shops/${w.shop.slug}/inventory/${variantId}/adjustments`,
    { delta, reason_code: delta > 0 ? 'received_stock' : 'damaged', note: 'Box of 12' },
    { 'Idempotency-Key': randomUUID() }
  )
}

async function defaultVariant(w: Awaited<ReturnType<typeof world>>, overrides = {}) {
  const response = await create(w, await draftBody(overrides))
  if (response.status !== 201) throw new Error(`createProduct answered ${response.status}`)
  const data = response.body.data as { id: string; variants: { id: string; sku: string }[] }
  return { productId: data.id, variantId: data.variants[0].id, sku: data.variants[0].sku }
}

test.group('T-UI-045 the variant stock history page', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-UI-045 the history page opens for the owner, rendered in the browser and never stored', async ({
    assert,
  }) => {
    const w = await world()
    const variant = await defaultVariant(w)
    const { status, headers, html, page } = await htmlPage(
      w.owner,
      historyPath(w.shop.slug, variant.variantId)
    )
    assert.equal(status, 200)
    assert.equal(page?.component, 'seller/stock_history')
    assert.equal(headers.get('cache-control'), 'private, no-store')
    assert.notInclude(html, 'No stock changes yet')
    assert.isTrue(page?.encryptHistory, 'T-SEC-043')
  })

  test('T-UI-045 every active role opens the history page: {role}')
    .with([
      { role: 'manager' },
      { role: 'catalog_editor' },
      { role: 'order_fulfiller' },
      { role: 'viewer' },
    ])
    .run(async ({ assert }, { role }) => {
      const w = await world()
      const variant = await defaultVariant(w)
      const memberId = await addMember(w.shop.shopId, role)
      const page = await htmlPage(
        await signIn(memberId),
        historyPath(w.shop.slug, variant.variantId)
      )
      assert.equal(page.status, 200)
    })

  test('T-SEC-031 the history page follows the products_view gate: {status}')
    .with([
      { status: 'pending_review' as const, mode: null, expected: 403 },
      { status: 'suspended' as const, mode: 'frozen' as const, expected: 200 },
    ])
    .run(async ({ assert }, { status, mode, expected }) => {
      const w = await world()
      const variant = await defaultVariant(w)
      await setShopStatus(w.shop.shopId, status, mode)
      const page = await htmlPage(w.owner, historyPath(w.shop.slug, variant.variantId))
      assert.equal(page.status, expected)
    })

  test('T-SEC-001 another shop’s variant is the 404 of a missing one', async ({ assert }) => {
    const mine = await world()
    const theirs = await world()
    const variant = await defaultVariant(theirs)
    const page = await htmlPage(mine.owner, historyPath(mine.shop.slug, variant.variantId))
    assert.equal(page.status, 404)
    const missing = await htmlPage(mine.owner, historyPath(mine.shop.slug, randomUUID()))
    assert.equal(missing.status, 404)
  })

  test('T-SEC-036 the history page sends the variant and its movements, naming people by role', async ({
    assert,
  }) => {
    const w = await world()
    const variant = await defaultVariant(w)
    const added = await adjustStock(w, variant.variantId, 5)
    assert.equal(added.status, 201)
    const removed = await adjustStock(w, variant.variantId, -1)
    assert.equal(removed.status, 201)
    const props = await pageProps(w.owner, historyPath(w.shop.slug, variant.variantId))
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'variant', 'movements'])
    assert.deepEqual(props.variant, {
      variant_id: variant.variantId,
      sku: variant.sku,
      label: 'Default',
      is_default: true,
      status: 'active',
      on_hand: 4,
      reserved: 0,
      available: 4,
      version: 3,
      product: {
        product_id: variant.productId,
        public_id: (props.variant as { product: { public_id: string } }).product.public_id,
        title: 'Organic cotton crew tee',
        status: 'draft',
      },
    })
    const movements = props.movements as {
      items: Record<string, unknown>[]
      meta: { limit: number; next_cursor: string | null }
    }
    assert.deepEqual(
      movements.items.map((item) => [item.reason_code, item.on_hand_delta, item.actor, item.note]),
      [
        ['damaged', -1, 'you', 'Box of 12'],
        ['received_stock', 5, 'you', 'Box of 12'],
      ]
    )
    assert.sameMembers(Object.keys(movements.items[0]), [
      'id',
      'kind',
      'reason_code',
      'on_hand_delta',
      'reserved_delta',
      'note',
      'actor',
      'request_id',
      'created_at',
    ])
    assert.isString(movements.items[0].request_id)
    assert.deepEqual(movements.meta, { limit: 25, next_cursor: null })
    // A manager reads the owner's changes as the owner's, never by name.
    const managerId = await addMember(w.shop.shopId, 'manager')
    const asManager = await pageProps(
      await signIn(managerId),
      historyPath(w.shop.slug, variant.variantId)
    )
    const actors = (asManager.movements as { items: { actor: string }[] }).items.map(
      (item) => item.actor
    )
    assert.deepEqual(actors, ['owner', 'owner'])
    const owner = await db.from('users').where('id', w.shop.ownerId).firstOrFail()
    assert.notInclude(JSON.stringify(asManager), owner.full_name)
    assert.notInclude(JSON.stringify(asManager), owner.email)
  })

  test('T-UI-045 a member’s change names their role, and a removed member’s names them former', async ({
    assert,
  }) => {
    const w = await world()
    const variant = await defaultVariant(w)
    const editorId = await addMember(w.shop.shopId, 'catalog_editor')
    const editor = await signIn(editorId)
    const made = await send(
      editor,
      'POST',
      `/api/v1/seller/shops/${w.shop.slug}/inventory/${variant.variantId}/adjustments`,
      { delta: 2, reason_code: 'received_stock' },
      { 'Idempotency-Key': randomUUID() }
    )
    assert.equal(made.status, 201, made.text)
    const actorOf = async () => {
      const props = await pageProps(w.owner, historyPath(w.shop.slug, variant.variantId))
      return (props.movements as { items: { actor: string }[] }).items[0].actor
    }
    assert.equal(await actorOf(), 'catalog_editor')
    await db
      .from('shop_memberships')
      .where({ shop_id: w.shop.shopId, user_id: editorId })
      .update({ status: 'removed', removed_at: new Date() })
    assert.equal(await actorOf(), 'former_member')
  })

  test('T-UI-045 the history pages back by cursor and refuses other parameters', async ({
    assert,
  }) => {
    const w = await world()
    const variant = await defaultVariant(w)
    for (const delta of [3, 2, 1]) await adjustStock(w, variant.variantId, delta)
    const path = historyPath(w.shop.slug, variant.variantId)
    const first = await pageProps(w.owner, `${path}?limit=2`)
    const page1 = first.movements as {
      items: { on_hand_delta: number }[]
      meta: { next_cursor: string | null }
    }
    assert.deepEqual(
      page1.items.map((item) => item.on_hand_delta),
      [1, 2]
    )
    const second = await pageProps(w.owner, `${path}?limit=2&cursor=${page1.meta.next_cursor}`)
    const page2 = second.movements as {
      items: { on_hand_delta: number }[]
      meta: { next_cursor: string | null }
    }
    assert.deepEqual(
      page2.items.map((item) => item.on_hand_delta),
      [3]
    )
    assert.isNull(page2.meta.next_cursor)
    // Exactly a page's worth leaves no next page.
    const whole = await pageProps(w.owner, `${path}?limit=3`)
    assert.isNull((whole.movements as { meta: { next_cursor: string | null } }).meta.next_cursor)
    // A cursor made for another variant's history is refused.
    const other = await defaultVariant(w, { title: 'Linen shirt' })
    const foreign = await w.owner.request(
      `${historyPath(w.shop.slug, other.variantId)}?cursor=${page1.meta.next_cursor}`,
      { headers: { Accept: 'text/html' } }
    )
    await foreign.arrayBuffer()
    assert.equal(foreign.status, 302)
    const refused = await w.owner.request(`${path}?status=draft`, {
      headers: { Accept: 'text/html' },
    })
    await refused.arrayBuffer()
    assert.equal(refused.status, 302)
    const location = new URL(refused.headers.get('location') ?? '', 'http://localhost')
    assert.equal(`${location.pathname}${location.search}`, path)
  })

  test('T-UI-045 an archived variant keeps its history page, and the list shows it while it holds stock', async ({
    assert,
  }) => {
    const w = await world()
    const variant = await defaultVariant(w)
    await adjustStock(w, variant.variantId, 2)
    await db.from('product_variants').where('id', variant.variantId).update({ status: 'archived' })
    const page = await pageProps(w.owner, historyPath(w.shop.slug, variant.variantId))
    assert.equal((page.variant as { status: string }).status, 'archived')
    const stock = await pageProps(w.owner, stockPath(w.shop.slug))
    const listed = (
      stock.inventory as { items: { variants: { variant_id: string; status: string }[] }[] }
    ).items[0].variants
    assert.deepEqual(listed, [{ ...listed[0], variant_id: variant.variantId, status: 'archived' }])
  })
})

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { effectiveRules } from '#modules/catalog/queries'
import { send, signIn } from '#tests/support/courier_http'
import { testBrowser, type Browser } from '#tests/support/browser'
import { useJobBoss } from '#tests/support/jobs'
import {
  categoryId,
  create,
  draftBody,
  insertBrand,
  productPath,
  productsPath,
  world,
} from '#tests/support/catalog'
import { addMember, createOwnerShop, setShopStatus } from '#tests/support/shops'
import { mediaPublicUrl } from '#config/storefront'

/*
 * The seller product pages (docs/08 §2.5; R1-S part 2f-i): what the server
 * decides. The forms' rules are unit tests (tests/unit/ui/
 * product_details.spec.ts); what the browser does with them is checked in
 * a browser.
 * - T-UI-042 (new): `/seller/{shopSlug}/products`, `/products/new` and
 *   `/products/{productId}` render in the browser (no server markup), are
 *   never stored (`private, no-store`) and carry `encryptHistory`
 *   (T-SEC-043); a guest is sent to `/login` with the page as `return_to`.
 *   The list and the editor are gated as `listShopProducts` and
 *   `getShopProduct` (every role; `active` or `suspended`), the new product
 *   page as `createProduct` (`shop.products.edit`; `active` only). The
 *   list reads its `status` and `q` from the URL, pages by cursor, and
 *   answers a refused parameter with the page without it (08 §7.2).
 * - T-SEC-036: each page's props are the shared ones and its own; the
 *   list's items and the editor's product are what the API answers; the
 *   form's choices are the active leaves with their effective rules, the
 *   attributes those rules name, and the active brands, with the product's
 *   own category and brand kept.
 * - T-SEC-030 and T-SEC-031: the new product page by role and by shop
 *   status.
 * - T-SEC-001 case (a): another shop's product under the caller's slug is
 *   the 404 page of a missing product.
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

const listPath = (slug: string) => `/seller/${slug}/products`
const newPath = (slug: string) => `/seller/${slug}/products/new`
const editPath = (slug: string, id: string) => `/seller/${slug}/products/${id}`

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

// A redirect's target, path and query, without the origin.
async function redirectOf(browser: Browser, path: string) {
  const response = await browser.request(path, { headers: { Accept: 'text/html' } })
  await response.arrayBuffer()
  const location = new URL(response.headers.get('location') ?? '', 'http://localhost')
  return { status: response.status, target: `${location.pathname}${location.search}` }
}

// A page's HTML with what differs between two requests taken out: the product ID, the request ID, the nonce.
async function pageText(response: Response, productId: string) {
  const html = await response.text()
  let text = html.replaceAll(productId, '<id>')
  const requestId = response.headers.get('x-request-id')
  if (requestId) text = text.replaceAll(requestId, '<request-id>')
  const nonce = /'nonce-([^']+)'/.exec(response.headers.get('content-security-policy') ?? '')?.[1]
  return nonce ? text.replaceAll(nonce, '<nonce>') : text
}

async function createdId(w: Awaited<ReturnType<typeof world>>, overrides = {}) {
  const response = await create(w, await draftBody(overrides))
  if (response.status !== 201) throw new Error(`createProduct answered ${response.status}`)
  return response.body.data.id as string
}

test.group('T-UI-042 the seller product list', (group) => {
  // `createProduct` sends its listing job inside its transaction.
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-UI-042 the list opens for the owner, rendered in the browser and never stored', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const browser = await signIn(shop.ownerId)
    const { status, headers, html, page } = await htmlPage(browser, listPath(shop.slug))
    assert.equal(status, 200)
    assert.equal(page?.component, 'seller/products')
    assert.equal(headers.get('cache-control'), 'private, no-store')
    assert.notInclude(html, 'Add your first product')
    assert.isTrue(page?.encryptHistory, 'T-SEC-043')
  })

  test('T-UI-042 every active role opens the list: {role}')
    .with([
      { role: 'manager' },
      { role: 'catalog_editor' },
      { role: 'order_fulfiller' },
      { role: 'viewer' },
    ])
    .run(async ({ assert }, { role }) => {
      const shop = await createOwnerShop()
      const memberId = await addMember(shop.shopId, role)
      const { status, page } = await htmlPage(await signIn(memberId), listPath(shop.slug))
      assert.equal(status, 200)
      assert.equal(page?.component, 'seller/products')
    })

  test('T-UI-042 a guest is sent to /login with the page as return_to: {page}')
    .with([{ page: 'list' }, { page: 'new' }, { page: 'editor' }])
    .run(async ({ assert }, { page }) => {
      const w = await world()
      const id = page === 'editor' ? await createdId(w) : ''
      const path =
        page === 'list'
          ? listPath(w.shop.slug)
          : page === 'new'
            ? newPath(w.shop.slug)
            : editPath(w.shop.slug, id)
      const response = await testBrowser().request(path, { headers: { Accept: 'text/html' } })
      await response.arrayBuffer()
      assert.equal(response.status, 302)
      const location = new URL(response.headers.get('location') ?? '', 'http://localhost')
      assert.equal(location.pathname, '/login')
      assert.equal(location.searchParams.get('return_to'), path)
    })

  test('T-SEC-031 the list follows the products_view gate: {status}')
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
      const page = await htmlPage(await signIn(shop.ownerId), listPath(shop.slug))
      assert.equal(page.status, expected)
    })

  test('T-SEC-036 the list sends one page of listShopProducts and the filters it read', async ({
    assert,
  }) => {
    const w = await world()
    await createdId(w)
    const archived = await createdId(w, { title: 'Retired hoodie' })
    await db.from('products').where('id', archived).update({ status: 'archived' })
    const props = await pageProps(w.owner, listPath(w.shop.slug))
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'products', 'filters'])
    const api = await send(w.owner, 'GET', productsPath(w.shop.slug))
    assert.deepEqual(props.products, { items: api.body.data, meta: api.body.meta })
    const items = (props.products as { items: { id: string }[] }).items
    assert.notInclude(
      items.map((item) => item.id),
      archived,
      'archived products are left out by default'
    )
    assert.deepEqual(props.filters, { status: null, q: null })
  })

  test('T-UI-042 the list reads status and q from the URL', async ({ assert }) => {
    const w = await world()
    const tee = await createdId(w, { title: 'Organic cotton crew tee' })
    await createdId(w, { title: 'Linen shirt' })
    const archived = await createdId(w, { title: 'Organic retired tee' })
    await db.from('products').where('id', archived).update({ status: 'archived' })
    const byTitle = await pageProps(w.owner, `${listPath(w.shop.slug)}?q=organic`)
    const titled = (byTitle.products as { items: { id: string }[] }).items
    assert.deepEqual(
      titled.map((item) => item.id),
      [tee]
    )
    assert.deepEqual(byTitle.filters, { status: null, q: 'organic' })
    const archivedOnly = await pageProps(w.owner, `${listPath(w.shop.slug)}?status=archived`)
    const listed = (archivedOnly.products as { items: { id: string }[] }).items
    assert.deepEqual(
      listed.map((item) => item.id),
      [archived]
    )
    assert.deepEqual(archivedOnly.filters, { status: 'archived', q: null })
  })

  test('T-UI-042 the list pages forward by cursor, keeping its filters', async ({ assert }) => {
    const w = await world()
    for (const title of ['Tee one', 'Tee two', 'Tee three']) await createdId(w, { title })
    const first = await pageProps(w.owner, `${listPath(w.shop.slug)}?q=tee&limit=2`)
    const page1 = first.products as {
      items: { id: string }[]
      meta: { next_cursor: string | null }
    }
    assert.lengthOf(page1.items, 2)
    assert.isString(page1.meta.next_cursor)
    const next = `${listPath(w.shop.slug)}?q=tee&limit=2&cursor=${page1.meta.next_cursor}`
    const second = await pageProps(w.owner, next)
    const page2 = second.products as { items: { id: string }[]; meta: { next_cursor: null } }
    assert.lengthOf(page2.items, 1)
    assert.isNull(page2.meta.next_cursor)
    assert.notInclude(
      page1.items.map((item) => item.id),
      page2.items[0].id
    )
  })

  test('T-UI-042 a refused parameter redirects to the list without it: {label}')
    .with([
      { label: 'unknown status', query: '?status=paused&q=tee', expected: '?q=tee' },
      { label: 'unknown parameter', query: '?utm_source=mail', expected: '' },
      { label: 'blank search', query: '?q=&status=draft', expected: '?status=draft' },
      { label: 'foreign cursor', query: '?status=draft&cursor=bm9wZQ', expected: '?status=draft' },
      { label: 'limit out of range', query: '?limit=500', expected: '' },
      { label: 'bracketed status', query: '?status[]=draft&q=tee', expected: '?q=tee' },
      { label: 'nested parameter', query: '?utm[source]=mail&q=tee', expected: '?q=tee' },
    ])
    .run(async ({ assert }, { query, expected }) => {
      const shop = await createOwnerShop()
      const browser = await signIn(shop.ownerId)
      const answer = await redirectOf(browser, `${listPath(shop.slug)}${query}`)
      assert.equal(answer.status, 302)
      assert.equal(answer.target, `${listPath(shop.slug)}${expected}`)
    })
})

test.group('T-UI-042 the new product page', () => {
  test('T-UI-042 the new product page opens for the owner, rendered in the browser and never stored', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const { status, headers, html, page } = await htmlPage(
      await signIn(shop.ownerId),
      newPath(shop.slug)
    )
    assert.equal(status, 200)
    assert.equal(page?.component, 'seller/product_new')
    assert.equal(headers.get('cache-control'), 'private, no-store')
    assert.notInclude(html, 'Save draft')
    assert.isTrue(page?.encryptHistory, 'T-SEC-043')
  })

  test('T-SEC-030 the new product page needs shop.products.edit: {role}')
    .with([
      { role: 'manager', expected: 200 },
      { role: 'catalog_editor', expected: 200 },
      { role: 'order_fulfiller', expected: 403 },
      { role: 'viewer', expected: 403 },
    ])
    .run(async ({ assert }, { role, expected }) => {
      const shop = await createOwnerShop()
      const memberId = await addMember(shop.shopId, role)
      const page = await htmlPage(await signIn(memberId), newPath(shop.slug))
      assert.equal(page.status, expected)
    })

  test('T-SEC-031 the new product page needs an active shop: {status}')
    .with([
      { status: 'suspended' as const, mode: 'fulfill_existing' as const },
      { status: 'suspended' as const, mode: 'frozen' as const },
      { status: 'pending_review' as const, mode: null },
    ])
    .run(async ({ assert }, { status, mode }) => {
      const shop = await createOwnerShop()
      await setShopStatus(shop.shopId, status, mode)
      const page = await htmlPage(await signIn(shop.ownerId), newPath(shop.slug))
      assert.equal(page.status, 403)
    })

  test('T-SEC-036 the form’s choices: the active leaves with their rules, their attributes and the active brands', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const active = await insertBrand('active')
    const pending = await insertBrand('pending')
    // A leaf's own row overrides its parent's: `tops` requires a size, this leaf does not.
    const size = await db
      .from('attributes')
      .where('code', 'apparel_size')
      .select('id')
      .firstOrFail()
    await db.table('category_attributes').insert({
      category_id: await categoryId('t-shirts'),
      attribute_id: size.id,
      usage: 'variant_axis',
      is_required: false,
    })
    const props = await pageProps(await signIn(shop.ownerId), newPath(shop.slug))
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'categories', 'attributes', 'brands'])

    type Category = {
      id: string
      label: string
      is_active: boolean
      rules: { attribute_code: string; usage: string; is_required: boolean }[]
    }
    const categories = props.categories as Category[]
    const leaves = await db
      .from('categories as c')
      .where('c.is_active', true)
      .whereNotExists((child) => child.from('categories as k').whereColumn('k.parent_id', 'c.id'))
      .select('c.id', 'c.path')
    assert.sameMembers(
      categories.map((category) => category.id),
      leaves.map((leaf) => leaf.id),
      'every active leaf, and nothing else'
    )
    assert.isTrue(categories.every((category) => category.is_active))
    // Tree order: the first leaf of the first top-level category leads.
    assert.equal(categories[0].label, 'Clothing › Tops › T-Shirts')
    assert.deepInclude(categories[0].rules, {
      attribute_code: 'apparel_size',
      usage: 'variant_axis',
      is_required: false,
    })

    // Each leaf's rules are the effective rules the actions check (docs/04 §3.7).
    for (const leaf of leaves) {
      const rules = await effectiveRules(db.connection(), leaf.path)
      const sent = categories.find((category) => category.id === leaf.id)!.rules
      assert.sameDeepMembers(
        sent,
        [...rules.values()].map((rule) => ({
          attribute_code: rule.code,
          usage: rule.usage,
          is_required: rule.isRequired,
        })),
        leaf.path
      )
    }

    const attributes = props.attributes as {
      code: string
      input: string
      values: { code: string; is_active: boolean }[]
    }[]
    const named = new Set(
      categories.flatMap((category) => category.rules.map((r) => r.attribute_code))
    )
    assert.sameMembers(
      attributes.map((attribute) => attribute.code),
      [...named]
    )
    const audience = attributes.find((attribute) => attribute.code === 'audience')!
    assert.equal(audience.input, 'multi')
    assert.deepEqual(
      audience.values.map((value) => value.code),
      ['men', 'women', 'kids']
    )

    const brands = (props.brands as { id: string }[]).map((brand) => brand.id)
    assert.include(brands, active)
    assert.notInclude(brands, pending)
  })
})

test.group('T-UI-042 the product editor page', (group) => {
  // `createProduct` sends its listing job inside its transaction.
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-UI-042 the editor opens for the owner, rendered in the browser and never stored', async ({
    assert,
  }) => {
    const w = await world()
    const id = await createdId(w)
    const { status, headers, html, page } = await htmlPage(w.owner, editPath(w.shop.slug, id))
    assert.equal(status, 200)
    assert.equal(page?.component, 'seller/product_edit')
    assert.equal(headers.get('cache-control'), 'private, no-store')
    assert.notInclude(html, 'Save details')
    assert.isTrue(page?.encryptHistory, 'T-SEC-043')
  })

  test('T-UI-042 every active role opens the editor: {role}')
    .with([
      { role: 'manager' },
      { role: 'catalog_editor' },
      { role: 'order_fulfiller' },
      { role: 'viewer' },
    ])
    .run(async ({ assert }, { role }) => {
      const w = await world()
      const id = await createdId(w)
      const memberId = await addMember(w.shop.shopId, role)
      const page = await htmlPage(await signIn(memberId), editPath(w.shop.slug, id))
      assert.equal(page.status, 200)
    })

  test('T-SEC-031 the editor follows the products_view gate: {status} {mode}')
    .with([
      { status: 'pending_review' as const, mode: null, expected: 403 },
      { status: 'rejected' as const, mode: null, expected: 403 },
      { status: 'closed' as const, mode: null, expected: 403 },
      { status: 'suspended' as const, mode: 'fulfill_existing' as const, expected: 200 },
      { status: 'suspended' as const, mode: 'frozen' as const, expected: 200 },
    ])
    .run(async ({ assert }, { status, mode, expected }) => {
      const w = await world()
      const id = await createdId(w)
      await setShopStatus(w.shop.shopId, status, mode)
      const page = await htmlPage(w.owner, editPath(w.shop.slug, id))
      assert.equal(page.status, expected)
    })

  test('T-SEC-036 the editor sends the product as getShopProduct answers it, with the form’s choices', async ({
    assert,
  }) => {
    const w = await world()
    const id = await createdId(w)
    const props = await pageProps(w.owner, editPath(w.shop.slug, id))
    assert.sameMembers(Object.keys(props), [
      ...SHARED_PROPS,
      'product',
      'categories',
      'attributes',
      'brands',
      'media_base',
    ])
    const api = await send(w.owner, 'GET', productPath(w.shop.slug, id))
    assert.deepEqual(props.product, api.body.data)
    // The public bucket's base URL, for the gallery's images (R1-S part 2g-i).
    assert.equal(props.media_base, mediaPublicUrl)
  })

  test('T-SEC-036 the editor keeps the product’s own category and brand when they are no longer offered', async ({
    assert,
  }) => {
    const w = await world()
    const tops = await categoryId('tops')
    const [leaf] = await db
      .table('categories')
      .insert({
        parent_id: tops,
        slug: 'test-leaf-retired',
        name: 'Test retired leaf',
        path: '/clothing/tops/test-leaf-retired/',
        depth: 3,
        position: 99,
      })
      .returning('id')
    const brand = await insertBrand('active')
    const id = await createdId(w, { category_id: leaf.id, brand_id: brand })
    await db.from('categories').where('id', leaf.id).update({ is_active: false })
    await db.from('brands').where('id', brand).update({ status: 'pending' })

    const editor = await pageProps(w.owner, editPath(w.shop.slug, id))
    const kept = (editor.categories as { id: string; label: string; is_active: boolean }[]).find(
      (category) => category.id === leaf.id
    )
    assert.deepInclude(kept, {
      label: 'Clothing › Tops › Test retired leaf',
      is_active: false,
    })
    assert.include(
      (editor.brands as { id: string }[]).map((item) => item.id),
      brand
    )

    const fresh = await pageProps(w.owner, newPath(w.shop.slug))
    assert.notInclude(
      (fresh.categories as { id: string }[]).map((category) => category.id),
      leaf.id
    )
    assert.notInclude(
      (fresh.brands as { id: string }[]).map((item) => item.id),
      brand
    )
  })

  test('T-SEC-036 the editor keeps the attributes of the product’s own axes when no rule names them', async ({
    assert,
  }) => {
    const w = await world()
    const id = await createdId(w, { category_id: await categoryId('jeans') })
    const sized = await send(
      w.owner,
      'PUT',
      `${productPath(w.shop.slug, id)}/variants`,
      {
        option_axes: ['waist_size_in'],
        variants: [{ option_value_codes: { waist_size_in: '30' }, sku: 'J-30', price_minor: 1 }],
      },
      { 'If-Match': '"1"' }
    )
    assert.equal(sized.status, 200)
    // The platform drops every rule that names the axis (inside the test's transaction).
    const waist = await db
      .from('attributes')
      .where('code', 'waist_size_in')
      .select('id')
      .firstOrFail()
    await db.from('category_attributes').where('attribute_id', waist.id).delete()

    const editor = await pageProps(w.owner, editPath(w.shop.slug, id))
    const codes = (editor.attributes as { code: string }[]).map((attribute) => attribute.code)
    assert.include(codes, 'waist_size_in')
    const fresh = await pageProps(w.owner, newPath(w.shop.slug))
    assert.notInclude(
      (fresh.attributes as { code: string }[]).map((attribute) => attribute.code),
      'waist_size_in'
    )
  })

  test('T-SEC-001 another shop’s product is the 404 page of a missing product', async ({
    assert,
  }) => {
    const mine = await world()
    const theirs = await world()
    const foreign = await createdId(theirs)
    const absent = '01900000-0000-7000-8000-000000000000'
    const missing = await mine.owner.request(editPath(mine.shop.slug, absent), {
      headers: { Accept: 'text/html' },
    })
    assert.equal(missing.status, 404)
    const expected = await pageText(missing, absent)
    const other = await mine.owner.request(editPath(mine.shop.slug, foreign), {
      headers: { Accept: 'text/html' },
    })
    assert.equal(other.status, 404)
    assert.equal(await pageText(other, foreign), expected)
    const malformed = await htmlPage(mine.owner, editPath(mine.shop.slug, 'not-a-uuid'))
    assert.equal(malformed.status, 404)
  })
})

test.group('T-UI-044 the product publishing actions', (group) => {
  // `createProduct` sends its listing job inside its transaction.
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-UI-044 the overview’s products item is done once a product is published', async ({
    assert,
  }) => {
    const w = await world()
    const id = await createdId(w, { warranty_text: 'No warranty' })
    const itemOf = async () => {
      const props = await pageProps(w.owner, `/seller/${w.shop.slug}`)
      return (props.checklist as { item: string; done: boolean }[]).find(
        (entry) => entry.item === 'product_live'
      )
    }
    assert.deepEqual(await itemOf(), { item: 'product_live', done: false })
    // Published as the gate would leave it (the gate itself is T-CAT-013's).
    await db
      .from('products')
      .where('id', id)
      .update({ status: 'published', published_at: new Date(), first_published_at: new Date() })
    assert.deepEqual(await itemOf(), { item: 'product_live', done: true })
    // Hidden again: nothing is live.
    await db.from('products').where('id', id).update({ status: 'unpublished' })
    assert.deepEqual(await itemOf(), { item: 'product_live', done: false })
  })

  test('T-UI-044 the overview leaves the products item out while the shop’s catalogue cannot be read', async ({
    assert,
  }) => {
    const w = await world()
    // The owner still opens the overview of a shop under review (07 §4.4), not its products.
    await setShopStatus(w.shop.shopId, 'pending_review')
    const props = await pageProps(w.owner, `/seller/${w.shop.slug}`)
    const items = (props.checklist as { item: string }[]).map((entry) => entry.item)
    assert.notInclude(items, 'product_live')
    assert.include(items, 'seller_agreement')
  })

  test('T-SEC-036 the editor keeps the attributes of the product’s own values when no rule names them', async ({
    assert,
  }) => {
    const w = await world()
    const id = await createdId(w)
    // The platform drops every rule that names `material` (inside the test's transaction).
    const material = await db
      .from('attributes')
      .where('code', 'material')
      .select('id')
      .firstOrFail()
    await db.from('category_attributes').where('attribute_id', material.id).delete()

    const editor = await pageProps(w.owner, editPath(w.shop.slug, id))
    assert.include(
      (editor.attributes as { code: string }[]).map((attribute) => attribute.code),
      'material'
    )
    const fresh = await pageProps(w.owner, newPath(w.shop.slug))
    assert.notInclude(
      (fresh.attributes as { code: string }[]).map((attribute) => attribute.code),
      'material'
    )
  })
})

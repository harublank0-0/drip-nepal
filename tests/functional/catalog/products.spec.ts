import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ProductFactory } from '#database/factories/product_factory'
import type { Browser } from '#tests/support/browser'
import { key, send, signIn } from '#tests/support/courier_http'
import { queued, useJobBoss } from '#tests/support/jobs'
import { addMember, createOwnerShop, setShopStatus, type OwnerShop } from '#tests/support/shops'

/*
 * The seller's product drafts over HTTP (docs/06 §13.5, §14.2; 01
 * FR-CAT-003, FR-CAT-011; docs/09 §12; R1-S part 2a):
 * - T-CAT-008 (new): `createProduct` answers 201 with `Location`, `ETag: "1"`
 *   and the editor view: a `draft`, `version` 1, one default variant
 *   (`Default`, SKU `DN-<public_id>`, price 0, stock 0) and
 *   `missing_for_submit`; it writes the product, its attribute values, the
 *   default variant, its `inventory_items` row at 0, one `product.create`
 *   audit row and one `catalog.refresh_listing` job; `getShopProduct`
 *   answers the same view with the ETag; the slug follows the title, or
 *   `product` for a Devanagari title.
 * - T-CAT-009 (new): `updateProduct` merges the given fields, replaces the
 *   attribute set when sent, keeps it when not, follows the title with the
 *   slug, moves the version, writes one `product.update` audit row naming
 *   the changed fields and sends the listing job; a request that changes
 *   nothing writes nothing; a `rejected` product returns to `draft`; a
 *   product `pending_review`, `archived` or `blocked` is 409; a new category
 *   that drops a used axis is refused.
 * - T-CAT-010 (new): `listShopProducts`, newest change first, by cursor;
 *   archived products only with `status=archived`; `q` matches a title or
 *   SKU prefix; an unknown status or parameter is 400.
 * - T-CAT-001: a create that fails leaves no product, key row or job.
 * - T-CAT-101: a category that is not a leaf, or not active, is 422.
 * - T-CAT-104: the leaf's inherited rules decide which attributes and how
 *   many values: a variant axis, an attribute of another category, two
 *   values of a single attribute and an unknown value are 422 on their paths.
 * - T-CAT-105: a live product keeps its disclosures and required attributes.
 * - T-API-004: `updateProduct` without `If-Match` is 428, a stale one 412
 *   with `current`. T-API-007: a replayed key answers the stored 201 and
 *   creates nothing more. T-API-003: cursor pages.
 * - T-SEC-003: server-owned members (`shop_id`, `status`, `version`,
 *   `public_id`, `created_by`) and an unknown attribute-item member are
 *   `unknown_field`. T-SEC-001: another shop's product is 404.
 *   T-SEC-030: a viewer reads but cannot write. T-SEC-031: reads open while
 *   suspended, writes `active` only.
 */

const productsPath = (slug: string) => `/api/v1/seller/shops/${slug}/products`
const productPath = (slug: string, id: string) => `${productsPath(slug)}/${id}`

const fields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

async function categoryId(slug: string) {
  const row = await db.from('categories').where('slug', slug).select('id').firstOrFail()
  return row.id as string
}

async function draftBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Organic cotton crew tee',
    description: '180 gsm, pre-shrunk.',
    category_id: await categoryId('t-shirts'),
    brand_id: null,
    attributes: [
      { attribute_code: 'audience', value_codes: ['men', 'women'] },
      { attribute_code: 'material', value_codes: ['cotton'] },
    ],
    manufacturer_name: 'Kathmandu Threads Pvt. Ltd.',
    is_imported: false,
    country_of_origin: null,
    warranty_text: null,
    care_and_precautions: 'Wash cold, dry in shade.',
    ...overrides,
  }
}

type World = { shop: OwnerShop; owner: Browser }

async function world(): Promise<World> {
  const shop = await createOwnerShop()
  return { shop, owner: await signIn(shop.ownerId) }
}

async function create(w: World, body: Record<string, unknown>, idempotencyKey = key()) {
  return send(w.owner, 'POST', productsPath(w.shop.slug), body, {
    'Idempotency-Key': idempotencyKey,
  })
}

const audits = (productId: string, action: string) =>
  db.from('audit_logs').where({ subject_id: productId, action })

test.group('T-CAT-008 createProduct and getShopProduct', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-CAT-008 a draft with its default variant, stock row, audit row and listing job', async ({
    assert,
  }) => {
    const w = await world()
    const response = await create(w, await draftBody())
    assert.equal(response.status, 201, response.text)
    const created = response.body.data
    assert.equal(response.headers.get('etag'), '"1"')
    assert.equal(
      response.headers.get('location'),
      `/api/v1/seller/shops/${w.shop.slug}/products/${created.id}`
    )
    assert.equal(created.status, 'draft')
    assert.equal(created.version, 1)
    assert.match(created.public_id, /^[0-9A-HJKMNP-TV-Z]{8}$/)
    assert.equal(created.category.path, '/clothing/tops/t-shirts/')
    assert.deepEqual(created.variants, [
      {
        id: created.variants[0].id,
        sku: `DN-${created.public_id}`,
        label: 'Default',
        status: 'active',
        price: { amount_minor: 0, currency: 'NPR' },
        compare_at_price: null,
        weight_grams: null,
        is_default: true,
        on_hand: 0,
      },
    ])
    assert.deepEqual(created.missing_for_submit, ['variants', 'media', 'warranty_text'])
    assert.sameDeepMembers(created.attributes, [
      { attribute_code: 'audience', value_codes: ['men', 'women'] },
      { attribute_code: 'material', value_codes: ['cotton'] },
    ])

    const row = await db.from('products').where('id', created.id).firstOrFail()
    assert.equal(row.shop_id, w.shop.shopId)
    assert.equal(row.slug, 'organic-cotton-crew-tee')
    assert.equal(row.created_by, w.shop.ownerId)
    const stock = await db
      .from('inventory_items')
      .where('variant_id', created.variants[0].id)
      .firstOrFail()
    assert.deepEqual([stock.on_hand, stock.reserved, stock.shop_id], [0, 0, w.shop.shopId])
    assert.lengthOf(await audits(created.id, 'product.create'), 1)
    const jobs = await queued<{ product_id: string }>('catalog.refresh_listing')
    assert.isTrue(jobs.some((job) => job.data.product_id === created.id))

    const read = await send(w.owner, 'GET', productPath(w.shop.slug, created.id))
    assert.equal(read.status, 200)
    assert.equal(read.headers.get('etag'), '"1"')
    assert.deepEqual(read.body.data, created)
  })

  test('T-CAT-008 a Devanagari title gets the slug product, and disclosures may be null on a draft', async ({
    assert,
  }) => {
    const w = await world()
    const response = await create(
      w,
      await draftBody({
        title: 'सुती टिसर्ट',
        description: null,
        manufacturer_name: '   ',
        is_imported: true,
        country_of_origin: null,
        care_and_precautions: null,
      })
    )
    assert.equal(response.status, 201, response.text)
    const row = await db.from('products').where('id', response.body.data.id).firstOrFail()
    assert.equal(row.slug, 'product')
    assert.isNull(row.manufacturer_name, 'a value of spaces clears the field')
    assert.deepEqual(response.body.data.missing_for_submit, [
      'variants',
      'media',
      'description',
      'manufacturer_name',
      'warranty_text',
      'care_and_precautions',
      'country_of_origin',
    ])
  })

  test('T-API-007 a replayed key answers the stored 201 and creates nothing more', async ({
    assert,
  }) => {
    const w = await world()
    const body = await draftBody()
    const idempotencyKey = key()
    const first = await create(w, body, idempotencyKey)
    const again = await create(w, body, idempotencyKey)
    assert.equal(again.status, 201)
    assert.equal(again.headers.get('idempotency-replayed'), 'true')
    assert.deepEqual(again.body, first.body)
    const count = await db.from('products').where('shop_id', w.shop.shopId).count('* as n')
    assert.equal(Number(count[0].n), 1)
    const reused = await create(w, { ...body, title: 'Another title' }, idempotencyKey)
    assert.equal(reused.status, 422)
    assert.equal(reused.body.code, 'IDEMPOTENCY_KEY_REUSED')
  })

  test('T-CAT-001 a create that fails leaves no product, key row or job', async ({ assert }) => {
    const w = await world()
    const idempotencyKey = key()
    const jobsBefore = await queued('catalog.refresh_listing')
    // Imported and made in Nepal: refused by the action after the key row was inserted.
    const response = await create(
      w,
      await draftBody({ is_imported: true, country_of_origin: 'NP' }),
      idempotencyKey
    )
    assert.equal(response.status, 422)
    assert.deepEqual(fields(response.body), [['country_of_origin', 'invalid']])
    assert.lengthOf(await db.from('products').where('shop_id', w.shop.shopId), 0)
    assert.lengthOf(await db.from('idempotency_keys').where('key', idempotencyKey), 0)
    assert.lengthOf(await queued('catalog.refresh_listing'), jobsBefore.length)
  })

  test('T-CAT-101 a category that is not a leaf, or not active, is 422', async ({ assert }) => {
    const w = await world()
    const parent = await create(w, await draftBody({ category_id: await categoryId('tops') }))
    assert.equal(parent.status, 422)
    assert.deepEqual(fields(parent.body), [['category_id', 'invalid']])
    const leaf = await categoryId('t-shirts')
    await db.from('categories').where('id', leaf).update({ is_active: false })
    const inactive = await create(w, await draftBody())
    assert.deepEqual(fields(inactive.body), [['category_id', 'invalid']])
  })

  test('T-CAT-104 the inherited rules decide the attributes and their values', async ({
    assert,
  }) => {
    const w = await world()
    const response = await create(
      w,
      await draftBody({
        attributes: [
          { attribute_code: 'apparel_size', value_codes: ['m'] },
          { attribute_code: 'shoe_size_eu', value_codes: ['42'] },
          { attribute_code: 'fit', value_codes: ['slim', 'regular'] },
          { attribute_code: 'material', value_codes: ['unobtanium'] },
        ],
      })
    )
    assert.equal(response.status, 422)
    assert.deepEqual(fields(response.body), [
      ['attributes.0.attribute_code', 'not_allowed'],
      ['attributes.1.attribute_code', 'not_allowed'],
      ['attributes.2.value_codes', 'too_many'],
      ['attributes.3.value_codes', 'unknown_value'],
    ])
    // A draft may leave a required attribute out (AC-FR-CAT-002-2).
    const partial = await create(w, await draftBody({ attributes: [] }))
    assert.equal(partial.status, 201, partial.text)
  })

  test('T-SEC-003 server-owned members and unknown item members are unknown_field', async ({
    assert,
  }) => {
    const w = await world()
    const body = await draftBody({
      shop_id: w.shop.shopId,
      status: 'published',
      version: 9,
      public_id: 'ZZZZZZZZ',
      created_by: w.shop.ownerId,
    })
    const response = await create(w, body)
    assert.equal(response.status, 422)
    assert.sameDeepMembers(fields(response.body), [
      ['shop_id', 'unknown_field'],
      ['status', 'unknown_field'],
      ['version', 'unknown_field'],
      ['public_id', 'unknown_field'],
      ['created_by', 'unknown_field'],
    ])
    const item = await create(
      w,
      await draftBody({
        attributes: [{ attribute_code: 'audience', value_codes: ['men'], attribute_id: 'x' }],
      })
    )
    assert.deepEqual(fields(item.body), [['attributes.0.attribute_id', 'unknown_field']])
    assert.lengthOf(await db.from('products').where('shop_id', w.shop.shopId), 0)
  })

  test('T-SEC-001 another shop’s product is 404; T-SEC-030 a viewer reads but cannot write', async ({
    assert,
  }) => {
    const w = await world()
    const created = await create(w, await draftBody())
    const other = await world()
    const foreign = await send(
      other.owner,
      'GET',
      productPath(other.shop.slug, created.body.data.id)
    )
    assert.equal(foreign.status, 404)
    const viewerId = await addMember(w.shop.shopId, 'viewer')
    const viewer = await signIn(viewerId)
    const read = await send(viewer, 'GET', productPath(w.shop.slug, created.body.data.id))
    assert.equal(read.status, 200)
    const write = await send(viewer, 'POST', productsPath(w.shop.slug), await draftBody(), {
      'Idempotency-Key': key(),
    })
    assert.equal(write.status, 403)
    const editorId = await addMember(w.shop.shopId, 'catalog_editor')
    const editor = await signIn(editorId)
    const edited = await send(editor, 'POST', productsPath(w.shop.slug), await draftBody(), {
      'Idempotency-Key': key(),
    })
    assert.equal(edited.status, 201)
  })

  test('T-SEC-031 reads open while suspended; writes need an active shop', async ({ assert }) => {
    const w = await world()
    const created = await create(w, await draftBody())
    await setShopStatus(w.shop.shopId, 'suspended', 'frozen')
    const read = await send(w.owner, 'GET', productPath(w.shop.slug, created.body.data.id))
    assert.equal(read.status, 200)
    const write = await create(w, await draftBody())
    assert.equal(write.status, 403)
    assert.equal(write.body.code, 'SHOP_NOT_ACTIVE')
    await setShopStatus(w.shop.shopId, 'closed')
    const closed = await send(w.owner, 'GET', productsPath(w.shop.slug))
    assert.equal(closed.status, 403)
  })
})

test.group('T-CAT-009 updateProduct', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  async function draft(w: World) {
    const response = await create(w, await draftBody())
    return response.body.data as { id: string; version: number }
  }

  const update = (w: World, id: string, body: unknown, version: number | null) =>
    send(
      w.owner,
      'PATCH',
      productPath(w.shop.slug, id),
      body,
      version === null ? {} : { 'If-Match': `"${version}"` }
    )

  test('T-CAT-009 merges the fields, keeps the attributes unless sent, and moves the version', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const response = await update(
      w,
      product.id,
      { title: 'Heavy cotton tee', warranty_text: 'No warranty', description: null },
      1
    )
    assert.equal(response.status, 200, response.text)
    assert.equal(response.headers.get('etag'), '"2"')
    const data = response.body.data
    assert.deepEqual([data.title, data.version, data.description], ['Heavy cotton tee', 2, null])
    assert.equal(data.warranty_text, 'No warranty')
    assert.lengthOf(data.attributes, 2, 'an absent attributes keeps the set')
    const row = await db.from('products').where('id', product.id).firstOrFail()
    assert.equal(row.slug, 'heavy-cotton-tee')
    const [audit] = await audits(product.id, 'product.update')
    assert.sameMembers(audit.changes.changed, ['title', 'description', 'warranty_text'])

    const attributes = await update(
      w,
      product.id,
      { attributes: [{ attribute_code: 'fit', value_codes: ['slim'] }] },
      2
    )
    assert.deepEqual(attributes.body.data.attributes, [
      { attribute_code: 'fit', value_codes: ['slim'] },
    ])

    const same = await update(w, product.id, { title: 'Heavy cotton tee' }, 3)
    assert.equal(same.status, 200)
    assert.equal(same.body.data.version, 3, 'a request that changes nothing keeps the version')
    assert.lengthOf(await audits(product.id, 'product.update'), 2)
  })

  test('T-API-004 no If-Match is 428; a stale version is 412 with current', async ({ assert }) => {
    const w = await world()
    const product = await draft(w)
    const missing = await update(w, product.id, { title: 'New title' }, null)
    assert.equal(missing.status, 428)
    const stale = await update(w, product.id, { title: 'New title' }, 7)
    assert.equal(stale.status, 412)
    assert.equal(stale.body.current.version, 1)
    assert.equal(stale.body.current.title, 'Organic cotton crew tee')
  })

  test('T-CAT-009 a rejected product returns to draft; a product under review, archived or blocked is 409', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    await db
      .from('products')
      .where('id', product.id)
      .update({ status: 'rejected', rejection_reason: 'Blurry photos' })
    const fixed = await update(w, product.id, { title: 'Sharper tee' }, 1)
    assert.equal(fixed.status, 200, fixed.text)
    assert.equal(fixed.body.data.status, 'draft')
    for (const status of ['archived', 'blocked'] as const) {
      await db.from('products').where('id', product.id).update({ status })
      const refused = await update(w, product.id, { title: 'Another title' }, 2)
      assert.equal(refused.status, 409, status)
      assert.equal(refused.body.code, 'INVALID_STATE_TRANSITION')
    }
  })

  test('T-CAT-009 a new category must allow the product’s option axes', async ({ assert }) => {
    const w = await world()
    const product = await draft(w)
    const size = await db.from('attributes').where('code', 'apparel_size').firstOrFail()
    await db
      .table('product_option_axes')
      .insert({ product_id: product.id, attribute_id: size.id, position: 1 })
    const shoes = await db
      .from('categories as c')
      .where('c.path', 'like', '/footwear/%')
      .whereNotExists((child) => child.from('categories as k').whereColumn('k.parent_id', 'c.id'))
      .select('c.id')
      .firstOrFail()
    const response = await update(w, product.id, { category_id: shoes.id }, 1)
    assert.equal(response.status, 422)
    assert.deepInclude(fields(response.body), ['category_id', 'axes_not_allowed'])
  })

  test('T-CAT-105 a live product keeps its disclosures and required attributes', async ({
    assert,
  }) => {
    const w = await world()
    const product = await ProductFactory.merge({ shopId: w.shop.shopId })
      .apply('published')
      .create()
    const cleared = await update(
      w,
      product.id,
      { warranty_text: null, attributes: [{ attribute_code: 'fit', value_codes: ['slim'] }] },
      1
    )
    assert.equal(cleared.status, 422)
    assert.sameDeepMembers(fields(cleared.body), [
      ['attributes', 'required'],
      ['warranty_text', 'required'],
    ])
    const row = await db.from('products').where('id', product.id).firstOrFail()
    assert.equal(row.version, 1)
  })

  test('T-SEC-001 another shop’s product is 404', async ({ assert }) => {
    const w = await world()
    const product = await draft(w)
    const other = await world()
    const response = await update(other, product.id, { title: 'Taken over' }, 1)
    assert.equal(response.status, 404)
  })
})

test.group('T-CAT-010 listShopProducts', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-CAT-010 newest change first, by cursor; archived only on request; q by title or SKU prefix', async ({
    assert,
  }) => {
    const w = await world()
    const ids: string[] = []
    for (const title of ['Alpha tee', 'Beta tee', 'Gamma hoodie']) {
      const response = await create(w, await draftBody({ title }))
      ids.push(response.body.data.id)
    }
    // Distinct change times, Gamma newest.
    for (const [index, id] of ids.entries()) {
      await db
        .from('products')
        .where('id', id)
        .update({ updated_at: db.raw(`now() - interval '${3 - index} minutes'`) })
    }
    const first = await send(w.owner, 'GET', `${productsPath(w.shop.slug)}?limit=2`)
    assert.equal(first.status, 200, first.text)
    assert.deepEqual(
      first.body.data.map((item: { title: string }) => item.title),
      ['Gamma hoodie', 'Beta tee']
    )
    assert.equal(first.body.data[0].variant_count, 1)
    const cursor = encodeURIComponent(first.body.meta.next_cursor)
    const second = await send(
      w.owner,
      'GET',
      `${productsPath(w.shop.slug)}?limit=2&cursor=${cursor}`
    )
    assert.deepEqual(
      second.body.data.map((item: { title: string }) => item.title),
      ['Alpha tee']
    )
    assert.isNull(second.body.meta.next_cursor)

    await db.from('products').where('id', ids[0]).update({ status: 'archived' })
    const active = await send(w.owner, 'GET', productsPath(w.shop.slug))
    assert.notInclude(
      active.body.data.map((item: { id: string }) => item.id),
      ids[0]
    )
    const archived = await send(w.owner, 'GET', `${productsPath(w.shop.slug)}?status=archived`)
    assert.deepEqual(
      archived.body.data.map((item: { id: string }) => item.id),
      [ids[0]]
    )

    const byTitle = await send(w.owner, 'GET', `${productsPath(w.shop.slug)}?q=gam`)
    assert.deepEqual(
      byTitle.body.data.map((item: { title: string }) => item.title),
      ['Gamma hoodie']
    )
    const sku = await db.from('product_variants').where('product_id', ids[1]).firstOrFail()
    const bySku = await send(
      w.owner,
      'GET',
      `${productsPath(w.shop.slug)}?q=${encodeURIComponent(sku.sku.slice(0, 6))}`
    )
    assert.include(
      bySku.body.data.map((item: { id: string }) => item.id),
      ids[1]
    )
  })

  test('T-CAT-010 an unknown status or parameter is 400', async ({ assert }) => {
    const w = await world()
    for (const query of ['status=sold', 'sort=price', `q=${'x'.repeat(101)}`]) {
      const response = await send(w.owner, 'GET', `${productsPath(w.shop.slug)}?${query}`)
      assert.equal(response.status, 400, query)
      assert.equal(response.body.code, 'INVALID_QUERY_PARAMETER')
    }
  })
})

test.group('T-CAT-007 and T-CAT-108 the draft insert and the listing job', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-CAT-007 a public_id collision is retried with a fresh one', async ({ assert }) => {
    const { insertProductDraft } = await import('#modules/catalog/actions/product_draft')
    const { withTx } = await import('#modules/platform/tx')
    const w = await world()
    const taken = await ProductFactory.merge({ shopId: w.shop.shopId }).create()
    const ids = [taken.publicId, 'FRESH0K1']
    const body = await draftBody()
    const draft = await withTx((trx) =>
      insertProductDraft(
        trx,
        {
          title: body.title,
          description: body.description,
          categoryId: body.category_id,
          brandId: null,
          attributes: [],
          manufacturerName: null,
          isImported: false,
          countryOfOrigin: null,
          warrantyText: null,
          careAndPrecautions: null,
        },
        { shopId: w.shop.shopId, actorUserId: w.shop.ownerId },
        () => ids.shift()!
      )
    )
    const row = await db.from('products').where('id', draft.productId).firstOrFail()
    assert.equal(row.public_id, 'FRESH0K1')
  })

  test('T-CAT-108 the job removes the listing row of a product that is not visible', async ({
    assert,
  }) => {
    const { refreshListing } = await import('#modules/catalog/jobs/refresh_listing')
    const w = await world()
    const product = await ProductFactory.merge({ shopId: w.shop.shopId }).create()
    const category = await db.from('categories').where('id', product.categoryId).firstOrFail()
    await db.table('product_listings').insert({
      product_id: product.id,
      shop_id: w.shop.shopId,
      shop_slug: w.shop.slug,
      shop_name: w.shop.name,
      public_id: product.publicId,
      slug: product.slug,
      title: product.title,
      category_id: category.id,
      category_path: category.path,
      category_names: category.name,
      min_price_minor: 100,
      max_price_minor: 100,
      in_stock: true,
      primary_image_keys: JSON.stringify({}),
      primary_image_alt: product.title,
      published_at: db.raw('now()'),
    })
    const result = await refreshListing({ product_id: product.id })
    assert.deepEqual(result, { outcome: 'not_visible', removed: 1 })
    assert.lengthOf(await db.from('product_listings').where('product_id', product.id), 0)
    const again = await refreshListing({ product_id: product.id })
    assert.deepEqual(again, { outcome: 'not_visible', removed: 0 }, 'a repeat is harmless')
    const gone = await refreshListing({ product_id: '01929a50-0000-7000-8000-000000000000' })
    assert.equal(gone.outcome, 'no_product')
  })
})

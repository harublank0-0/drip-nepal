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
  db.from('audit_logs').where({ subject_id: productId, action }).orderBy('id')

// Brands are platform reference data; none is seeded yet, so tests insert their own.
async function insertBrand(status = 'active', requiresModeration = false) {
  const slug = `test-brand-${Math.random().toString(36).slice(2, 10)}`
  const [row] = await db
    .table('brands')
    .insert({ slug, name: `Test brand ${slug}`, status, requires_moderation: requiresModeration })
    .returning('id')
  return row.id as string
}

async function jobsFor(productId: string) {
  const jobs = await queued<{ product_id: string }>('catalog.refresh_listing')
  return jobs.filter((job) => job.data.product_id === productId)
}

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
    const [audit] = await audits(created.id, 'product.create')
    assert.deepEqual(audit.changes, {
      status: { from: null, to: 'draft' },
      category_id: { from: null, to: created.category.id },
    })
    assert.lengthOf(await jobsFor(created.id), 1)

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

  test('T-CAT-001 a failure after every write rolls back the product, variant, stock, audit row, key and job', async ({
    assert,
  }) => {
    const { createProduct } = await import('#modules/inventory/actions/create_product')
    const { requestFingerprint } = await import('#modules/platform/idempotency')
    const w = await world()
    const body = await draftBody()
    const jobsBefore = await queued('catalog.refresh_listing')
    const failed = await createProduct(
      {
        title: body.title,
        description: body.description,
        categoryId: body.category_id,
        brandId: null,
        attributes: [{ code: 'audience', valueCodes: ['men'] }],
        manufacturerName: null,
        isImported: false,
        countryOfOrigin: null,
        warrantyText: null,
        careAndPrecautions: null,
      },
      {
        shopId: w.shop.shopId,
        actor: {
          type: 'shop_member',
          userId: w.shop.ownerId,
          role: `shop:${w.shop.shopId}:owner`,
          requestId: null,
          ipHash: null,
        },
        idempotency: {
          actorScope: w.shop.ownerId,
          operation: 'createProduct',
          key: key(),
          fingerprint: requestFingerprint({ method: 'POST', route: '/', params: {}, body }),
        },
        // The presenter runs last, after every row and the job are written.
        present: async () => {
          throw new Error('presenter failed')
        },
      }
    ).then(
      () => null,
      (error: Error) => error
    )
    assert.equal(failed?.message, 'presenter failed')
    assert.lengthOf(await db.from('products').where('shop_id', w.shop.shopId), 0)
    assert.lengthOf(await db.from('product_variants').where('shop_id', w.shop.shopId), 0)
    assert.lengthOf(await db.from('inventory_items').where('shop_id', w.shop.shopId), 0)
    assert.lengthOf(
      await db.from('audit_logs').where({ shop_id: w.shop.shopId, action: 'product.create' }),
      0
    )
    assert.lengthOf(
      await db
        .from('idempotency_keys')
        .where({ actor_scope: w.shop.ownerId, operation: 'createProduct' }),
      0
    )
    assert.lengthOf(await queued('catalog.refresh_listing'), jobsBefore.length)
  })

  test('T-API-007 a create without an Idempotency-Key is 400 and writes nothing', async ({
    assert,
  }) => {
    const w = await world()
    const response = await send(w.owner, 'POST', productsPath(w.shop.slug), await draftBody())
    assert.equal(response.status, 400)
    assert.equal(response.body.code, 'IDEMPOTENCY_KEY_REQUIRED')
    assert.lengthOf(await db.from('products').where('shop_id', w.shop.shopId), 0)
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

  test('T-CAT-104 the deepest rule on the path wins', async ({ assert }) => {
    const w = await world()
    // `fit` is an optional rule of `clothing`; made required on the leaf, the leaf's row wins.
    const leaf = await categoryId('t-shirts')
    const fit = await db.from('attributes').where('code', 'fit').firstOrFail()
    await db.table('category_attributes').insert({
      category_id: leaf,
      attribute_id: fit.id,
      usage: 'product',
      is_required: true,
    })
    const product = await ProductFactory.merge({ shopId: w.shop.shopId })
      .apply('published')
      .create()
    const response = await send(
      w.owner,
      'PATCH',
      productPath(w.shop.slug, product.id),
      {
        attributes: [
          { attribute_code: 'audience', value_codes: ['men'] },
          { attribute_code: 'material', value_codes: ['cotton'] },
        ],
      },
      { 'If-Match': '"1"' }
    )
    assert.equal(response.status, 422)
    assert.deepEqual(fields(response.body), [['attributes', 'required']])
    assert.include(response.body.errors[0].message, 'Fit')
  })

  test('T-CAT-008 every rule problem comes in one 422, the origin rule included', async ({
    assert,
  }) => {
    const w = await world()
    const response = await create(
      w,
      await draftBody({
        is_imported: false,
        country_of_origin: 'CN',
        attributes: [{ attribute_code: 'fit', value_codes: ['slim', 'regular'] }],
      })
    )
    assert.equal(response.status, 422)
    assert.deepEqual(fields(response.body), [
      ['country_of_origin', 'invalid'],
      ['attributes.0.value_codes', 'too_many'],
    ])
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
    assert.deepEqual(audit.changes, { changed: ['title', 'description', 'warranty_text'] })
    assert.lengthOf(await jobsFor(product.id), 2, 'the create and this edit each sent the job')

    const attributes = await update(
      w,
      product.id,
      { attributes: [{ attribute_code: 'fit', value_codes: ['slim'] }] },
      2
    )
    assert.deepEqual(attributes.body.data.attributes, [
      { attribute_code: 'fit', value_codes: ['slim'] },
    ])
    const second = await audits(product.id, 'product.update')
    assert.deepEqual(second[1].changes, { changed: ['attributes'] })

    const same = await update(w, product.id, { title: 'Heavy cotton tee' }, 3)
    assert.equal(same.status, 200)
    assert.equal(same.body.data.version, 3, 'a request that changes nothing keeps the version')
    assert.lengthOf(await audits(product.id, 'product.update'), 2)
    assert.lengthOf(await jobsFor(product.id), 3, 'no job for a request that changes nothing')
  })

  test('T-CAT-009 an edit checks only what it sends: a brand the platform withdrew does not block a title edit', async ({
    assert,
  }) => {
    const w = await world()
    const brand = await insertBrand()
    const response = await create(w, await draftBody({ brand_id: brand }))
    assert.equal(response.status, 201, response.text)
    const product = response.body.data
    await db.from('brands').where('id', brand).update({ status: 'rejected' })
    const title = await update(w, product.id, { title: 'Renamed tee' }, 1)
    assert.equal(title.status, 200, title.text)
    const sent = await update(w, product.id, { brand_id: brand, title: 'Renamed again' }, 2)
    assert.equal(sent.status, 200, 'the same brand is not a change')
    const pending = await insertBrand('pending')
    const refused = await update(w, product.id, { brand_id: pending }, 3)
    assert.deepEqual(fields(refused.body), [['brand_id', 'invalid']])
  })

  test('T-SEC-003 the edit refuses unknown members and a null where a value is required', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const unknown = await update(w, product.id, { status: 'published', shop_id: w.shop.shopId }, 1)
    assert.sameDeepMembers(fields(unknown.body), [
      ['status', 'unknown_field'],
      ['shop_id', 'unknown_field'],
    ])
    const item = await update(
      w,
      product.id,
      { attributes: [{ attribute_code: 'fit', value_codes: ['slim'], position: 1 }] },
      1
    )
    assert.deepEqual(fields(item.body), [['attributes.0.position', 'unknown_field']])
    const nulls = await update(
      w,
      product.id,
      { title: null, category_id: null, attributes: null, is_imported: null },
      1
    )
    assert.sameDeepMembers(fields(nulls.body), [
      ['title', 'required'],
      ['category_id', 'required'],
      ['attributes', 'required'],
      ['is_imported', 'required'],
    ])
    const row = await db.from('products').where('id', product.id).firstOrFail()
    assert.equal(row.version, 1)
  })

  test('T-SEC-030 a viewer cannot edit; T-SEC-031 a suspended shop cannot edit', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const viewer = await signIn(await addMember(w.shop.shopId, 'viewer'))
    const refused = await send(
      viewer,
      'PATCH',
      productPath(w.shop.slug, product.id),
      { title: 'Viewer edit' },
      { 'If-Match': '"1"' }
    )
    assert.equal(refused.status, 403)
    assert.equal(refused.body.code, 'FORBIDDEN')
    await setShopStatus(w.shop.shopId, 'suspended', 'fulfill_existing')
    const suspended = await update(w, product.id, { title: 'Suspended edit' }, 1)
    assert.equal(suspended.status, 403)
    assert.equal(suspended.body.code, 'SHOP_NOT_ACTIVE')
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
    const [audit] = await audits(product.id, 'product.update')
    assert.deepEqual(audit.changes, {
      changed: ['title'],
      status: { from: 'rejected', to: 'draft' },
    })
    // A product under review must hold its disclosures and submission time (04a §7.6).
    await db
      .from('products')
      .where('id', product.id)
      .update({ warranty_text: 'No warranty', submitted_at: db.raw('now()') })
    for (const status of ['pending_review', 'archived', 'blocked'] as const) {
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

  test('T-CAT-105 a live product keeps its category’s required axes and avoids a watch-listed brand', async ({
    assert,
  }) => {
    const w = await world()
    const product = await ProductFactory.merge({ shopId: w.shop.shopId })
      .apply('published')
      .create()
    // T-shirts require a size axis (04 §21.3); the published product has none, so a move to
    // another leaf of `tops` must bring one. Shirts are a sibling leaf with the same rule.
    const sibling = await db
      .from('categories as c')
      .where('c.path', 'like', '/clothing/tops/%')
      .whereNot('c.slug', 't-shirts')
      .whereNotExists((child) => child.from('categories as k').whereColumn('k.parent_id', 'c.id'))
      .select('c.id')
      .firstOrFail()
    const moved = await update(w, product.id, { category_id: sibling.id }, 1)
    assert.equal(moved.status, 422)
    assert.deepInclude(fields(moved.body), ['category_id', 'axes_required'])

    const watched = await insertBrand('active', true)
    const branded = await update(w, product.id, { brand_id: watched }, 1)
    assert.equal(branded.status, 422)
    assert.deepEqual(fields(branded.body), [['brand_id', 'moderation_required']])
    const row = await db.from('products').where('id', product.id).firstOrFail()
    assert.deepEqual([row.version, row.brand_id], [1, null])
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

  // The order by change time and its cursor pages need real commits: tests/concurrency/catalog.
  test('T-CAT-010 archived only on request; q matches a title or SKU prefix, not a fragment', async ({
    assert,
  }) => {
    const w = await world()
    const ids: string[] = []
    for (const title of ['Alpha tee', 'Beta tee', 'Gamma hoodie']) {
      const response = await create(w, await draftBody({ title }))
      ids.push(response.body.data.id)
    }
    const listed = async (query = '') => {
      const response = await send(w.owner, 'GET', `${productsPath(w.shop.slug)}${query}`)
      assert.equal(response.status, 200, response.text)
      return response.body.data as { id: string; title: string; variant_count: number }[]
    }
    const idsOf = async (query = '') => {
      const items = await listed(query)
      return items.map((item) => item.id)
    }
    const all = await listed()
    assert.sameMembers(
      all.map((item) => item.id),
      ids
    )
    assert.isTrue(all.every((item) => item.variant_count === 1))

    await db.from('products').where('id', ids[0]).update({ status: 'archived' })
    assert.notInclude(await idsOf(), ids[0])
    assert.deepEqual(await idsOf('?status=archived'), [ids[0]])

    assert.deepEqual(await idsOf('?q=gam'), [ids[2]])
    assert.deepEqual(await listed('?q=tee'), [], 'a word inside a title is not a prefix')
    const sku = await db.from('product_variants').where('product_id', ids[1]).firstOrFail()
    assert.deepEqual(await idsOf(`?q=${encodeURIComponent(sku.sku.slice(0, 6))}`), [ids[1]])
    assert.deepEqual(
      await listed(`?q=${encodeURIComponent(sku.sku.slice(3, 9))}`),
      [],
      'a fragment inside a SKU is not a prefix'
    )
  })

  test('T-API-003 a tampered cursor, or one made for other filters, is 400', async ({ assert }) => {
    const w = await world()
    for (const title of ['Alpha tee', 'Alpine tee']) await create(w, await draftBody({ title }))
    const page = await send(w.owner, 'GET', `${productsPath(w.shop.slug)}?q=al&limit=1`)
    const cursor = encodeURIComponent(page.body.meta.next_cursor)
    const same = await send(
      w.owner,
      'GET',
      `${productsPath(w.shop.slug)}?q=al&limit=1&cursor=${cursor}`
    )
    assert.equal(same.status, 200)
    for (const query of [
      `q=alp&limit=1&cursor=${cursor}`,
      `status=draft&q=al&limit=1&cursor=${cursor}`,
      'cursor=not-a-cursor',
    ]) {
      const response = await send(w.owner, 'GET', `${productsPath(w.shop.slug)}?${query}`)
      assert.equal(response.status, 400, query)
      assert.equal(response.body.code, 'INVALID_QUERY_PARAMETER')
    }
  })

  test('T-SEC-031 the reads are refused while the shop is pending review, rejected or closed', async ({
    assert,
  }) => {
    const w = await world()
    const created = await create(w, await draftBody())
    for (const status of ['pending_review', 'rejected', 'closed'] as const) {
      await setShopStatus(w.shop.shopId, status)
      for (const path of [
        productsPath(w.shop.slug),
        productPath(w.shop.slug, created.body.data.id),
      ]) {
        const response = await send(w.owner, 'GET', path)
        assert.equal(response.status, 403, `${status} ${path}`)
      }
    }
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

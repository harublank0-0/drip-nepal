import { test } from '@japa/runner'
import { randomBytes, randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { ShopFactory } from '#database/factories/shop_factory'
import { UserFactory } from '#database/factories/user_factory'
import { refreshListing } from '#modules/catalog/jobs/refresh_listing'
import { holdsAcceptedAgreement } from '#modules/shops/queries'
import type { Browser } from '#tests/support/browser'
import {
  audits,
  create,
  draftBody,
  fields,
  insertBrand,
  jobsFor,
  productPath,
  world,
  type World,
} from '#tests/support/catalog'
import { send, signIn } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import { addMember, setShopStatus } from '#tests/support/shops'

/*
 * The product status operations over HTTP (docs/06 §13.5, 05 §6.10; 01
 * FR-CAT-005, FR-CAT-007; R1-S part 2e-ii). The owner's shop is in `post`
 * review mode, as `platform:create-shop` creates it.
 *
 * - T-CAT-013: a ready draft is published (`published_at`,
 *   `first_published_at`, version + 1, one `product.publish` row, a listing
 *   job, then a listing row); one 422 lists every missing item of the gate
 *   (variants, media, disclosures, required attributes and axes, shipping,
 *   and an agreement for a version still accepted); a draft is also checked
 *   as a new product (an active leaf category, a selectable brand), an
 *   unpublished product is not; republishing runs the gate again; unpublish,
 *   republish (`published_at` moves, `first_published_at` kept), archive
 *   (every active variant archived, its SKU free again) and restore
 *   (variants stay archived) each write their audit row; a transition the
 *   status does not allow is 409 with `allowed_events`, empty for
 *   `pending_review`, `rejected` and `blocked`; a draft in a `pre` shop or of
 *   a watch-listed brand is 409 with `allowed_events: [submit]`, an
 *   unpublished product of one is republished.
 * - T-SEC-001: another shop's product is 404 and changes nothing.
 * - T-SEC-003: a body member is `unknown_field`, and nothing changes.
 * - T-SEC-030: a viewer or an order fulfiller cannot publish or archive; a
 *   catalog editor and a manager can. No role of 07 §4.3 holds one of
 *   `shop.products.publish` and `shop.products.edit` without the other, so
 *   no role test can tell the two apart.
 * - T-SEC-031: a suspended shop can do none of the four.
 */

const statusPath = (w: World, productId: string, operation: string) =>
  `${productPath(w.shop.slug, productId)}/${operation}`

function act(w: World, productId: string, operation: string, as: Browser = w.owner, body = {}) {
  return send(as, 'POST', statusPath(w, productId, operation), body)
}

const productRow = (id: string) => db.from('products').where('id', id).firstOrFail()

async function readyAsset(shopId: string, ownerId: string) {
  const [row] = await db
    .table('media_assets')
    .insert({
      shop_id: shopId,
      kind: 'product_image',
      status: 'ready',
      original_key: `originals/${shopId}/${randomUUID()}/v1`,
      mime: 'image/jpeg',
      bytes: 2048,
      upload_etag: '"e"',
      upload_bytes: 2048,
      sha256: Buffer.alloc(32),
      processed_at: db.raw('now()'),
      derived_keys: JSON.stringify({ 320: 'p/x/abcdef0123456789-320.webp' }),
      width: 800,
      height: 800,
      uploaded_by: ownerId,
    })
    .returning('id')
  return row.id as string
}

// The shop's coverage (Kathmandu and Kaski) with a rate for each zone, through `replaceShopShipping`.
async function configureShipping(w: World) {
  const path = `/api/v1/seller/shops/${w.shop.slug}/shipping`
  const current = await send(w.owner, 'GET', path)
  const response = await send(
    w.owner,
    'PUT',
    path,
    {
      coverage: ['306', '405'],
      rates: [
        { zone_code: 'ktm_valley', fee_minor: 10000, est_min_days: 0, est_max_days: 1 },
        { zone_code: 'outside_valley', fee_minor: 15050, est_min_days: 2, est_max_days: 5 },
      ],
    },
    { 'If-Match': `"${current.body.data.version}"` }
  )
  if (response.status !== 200) throw new Error(`shipping: ${response.text}`)
}

// A draft that passes the gate: disclosures, a priced variant on the required axis, a ready image.
async function readyDraft(
  w: World,
  options: { sku?: string; body?: Record<string, unknown> } = {}
) {
  const sku = options.sku ?? `TEE-M-${randomUUID().slice(0, 6)}`
  const created = await create(
    w,
    await draftBody({ warranty_text: 'No warranty', ...options.body })
  )
  if (created.status !== 201) throw new Error(`create: ${created.text}`)
  const productId = created.body.data.id as string
  const variants = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, productId)}/variants`,
    {
      option_axes: ['apparel_size'],
      variants: [{ option_value_codes: { apparel_size: 'm' }, sku, price_minor: 129900 }],
    },
    { 'If-Match': '"1"' }
  )
  if (variants.status !== 200) throw new Error(`variants: ${variants.text}`)
  const image = await readyAsset(w.shop.shopId, w.shop.ownerId)
  const media = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, productId)}/media`,
    { items: [{ media_asset_id: image, position: 1, alt_text: null }] },
    { 'If-Match': '"2"' }
  )
  if (media.status !== 200) throw new Error(`media: ${media.text}`)
  return { productId, sku }
}

// A leaf category of the test's own beside the seeded `t-shirts`, so it inherits the same rules.
async function insertLeafCategory() {
  const sibling = await db
    .from('categories')
    .where('slug', 't-shirts')
    .select('parent_id', 'path', 'depth')
    .firstOrFail()
  const slug = `test-leaf-${randomUUID().slice(0, 8)}`
  const [row] = await db
    .table('categories')
    .insert({
      parent_id: sibling.parent_id,
      slug,
      name: `Test leaf ${slug.slice(-8)}`,
      path: sibling.path.replace(/t-shirts\/$/, `${slug}/`),
      depth: sibling.depth,
    })
    .returning('id')
  return row.id as string
}

async function publishAndUnpublish(w: World, productId: string) {
  for (const operation of ['publish', 'unpublish']) {
    const response = await act(w, productId, operation)
    if (response.status !== 200) throw new Error(`${operation}: ${response.text}`)
  }
}

test.group('T-CAT-013 publish, unpublish, archive and restore', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-CAT-013 a ready draft is published, audited, and gains its listing row', async ({
    assert,
  }) => {
    const w = await world()
    await configureShipping(w)
    const { productId } = await readyDraft(w)
    const jobsBefore = await jobsFor(productId)
    const response = await act(w, productId, 'publish')
    assert.equal(response.status, 200, response.text)
    assert.equal(response.body.data.status, 'published')
    assert.equal(response.headers.get('etag'), '"4"')
    const row = await productRow(productId)
    assert.isNotNull(row.published_at)
    assert.equal(new Date(row.first_published_at).getTime(), new Date(row.published_at).getTime())
    const [audit] = await audits(productId, 'product.publish')
    assert.deepEqual(audit.changes, { status: { from: 'draft', to: 'published' } })
    assert.lengthOf(await jobsFor(productId), jobsBefore.length + 1)
    await refreshListing({ product_id: productId })
    assert.isOk(await db.from('product_listings').where('product_id', productId).first())
  })

  test('T-CAT-013 one 422 lists every missing item of the gate, and nothing changes', async ({
    assert,
  }) => {
    const w = await world()
    // A draft may leave out a required attribute (material); publishing may not.
    const created = await create(
      w,
      await draftBody({ attributes: [{ attribute_code: 'audience', value_codes: ['men'] }] })
    )
    assert.equal(created.status, 201, created.text)
    const productId = created.body.data.id as string
    const response = await act(w, productId, 'publish')
    assert.equal(response.status, 422, response.text)
    // The default variant is priced 0 and has no size; no image; no warranty; no shipping set up.
    assert.sameDeepMembers(fields(response.body), [
      ['variants', 'required'],
      ['media', 'required'],
      ['warranty_text', 'required'],
      ['attributes', 'required'],
      ['option_axes', 'required'],
      ['shipping', 'required'],
    ])
    const row = await productRow(productId)
    assert.equal(row.status, 'draft')
    assert.equal(row.version, 1)
    assert.lengthOf(await audits(productId, 'product.publish'), 0)
  })

  test('T-CAT-013 a shop whose agreement version is no longer accepted cannot publish', async ({
    assert,
  }) => {
    const owner = await UserFactory.create()
    const shop = await ShopFactory.merge({ ownerUserId: owner.id }).create()
    await db.table('shop_agreements').insert({
      shop_id: shop.id,
      agreement_version: '2026-01-01',
      accepted_by_user_id: owner.id,
      ip_hash: randomBytes(32),
      request_id: randomUUID(),
    })
    await db
      .from('shops')
      .where('id', shop.id)
      .update({
        status: 'active',
        approved_at: db.raw('now()'),
        approved_by: owner.id,
        product_review_mode: 'post',
      })
    const w: World = {
      shop: {
        shopId: shop.id,
        slug: shop.slug,
        name: shop.name,
        contactEmail: shop.contactEmail,
        ownerId: owner.id,
      },
      owner: await signIn(owner.id),
    }
    const created = await create(w, await draftBody())
    assert.equal(created.status, 201, created.text)
    const response = await act(w, created.body.data.id, 'publish')
    assert.equal(response.status, 422, response.text)
    assert.deepInclude(fields(response.body), ['agreement', 'required'])
  })

  test('T-CAT-013 an older agreement is accepted through its last Kathmandu day', async ({
    assert,
  }) => {
    const owner = await UserFactory.create()
    const shop = await ShopFactory.merge({ ownerUserId: owner.id }).create()
    await db.table('shop_agreements').insert({
      shop_id: shop.id,
      agreement_version: '2026-01-01',
      accepted_by_user_id: owner.id,
      ip_hash: randomBytes(32),
      request_id: randomUUID(),
    })
    const registry = [
      { version: '2026-01-01', isFinal: true, acceptedUntil: '2026-12-31' },
      { version: '2026-11-23', isFinal: true, acceptedUntil: null },
    ]
    const holds = (at: string) => holdsAcceptedAgreement(shop.id, { at: new Date(at), registry })
    assert.isTrue(await holds('2026-12-31T18:14:00Z'), '23:59 on 31 December in Kathmandu')
    // 00:15 on 1 January in Kathmandu, while it is still 31 December in UTC.
    assert.isFalse(await holds('2026-12-31T18:30:00Z'))
  })

  test('T-CAT-013 a draft is checked as a new product: an active leaf category and a selectable brand', async ({
    assert,
  }) => {
    const w = await world()
    await configureShipping(w)
    const brandId = await insertBrand('active')
    const leaf = await insertLeafCategory()
    const { productId } = await readyDraft(w, { body: { brand_id: brandId, category_id: leaf } })
    await db.from('brands').where('id', brandId).update({ status: 'pending' })
    await db.from('categories').where('id', leaf).update({ is_active: false })
    const response = await act(w, productId, 'publish')
    assert.equal(response.status, 422, response.text)
    assert.sameDeepMembers(fields(response.body), [
      ['category_id', 'invalid'],
      ['brand_id', 'invalid'],
    ])
    const row = await productRow(productId)
    assert.equal(row.status, 'draft')
  })

  test('T-CAT-013 a stored attribute the category no longer takes is reported on attributes', async ({
    assert,
  }) => {
    const w = await world()
    await configureShipping(w)
    const leaf = await insertLeafCategory()
    const code = `test_fit_${randomUUID().slice(0, 6)}`
    const [attribute] = await db
      .table('attributes')
      .insert({ code, name: 'Test fit', scope: 'product', input: 'single' })
      .returning('id')
    await db
      .table('attribute_values')
      .insert({ attribute_id: attribute.id, code: 'slim', label: 'Slim' })
    await db
      .table('category_attributes')
      .insert({ category_id: leaf, attribute_id: attribute.id, usage: 'product' })
    const body = await draftBody({ category_id: leaf })
    const { productId } = await readyDraft(w, {
      body: {
        category_id: leaf,
        attributes: [...body.attributes, { attribute_code: code, value_codes: ['slim'] }],
      },
    })
    await db
      .from('category_attributes')
      .where({ category_id: leaf, attribute_id: attribute.id })
      .delete()
    const response = await act(w, productId, 'publish')
    assert.equal(response.status, 422, response.text)
    // The request sent no attributes, so the stored order's index is not given; the message names it.
    assert.deepEqual(fields(response.body), [['attributes', 'not_allowed']])
    assert.match(response.body.errors[0].message, new RegExp(`^${code}: `))
  })

  test('T-CAT-013 republishing runs the gate again, but keeps the category and brand it had', async ({
    assert,
  }) => {
    const w = await world()
    await configureShipping(w)
    const brandId = await insertBrand('active')
    const leaf = await insertLeafCategory()
    const { productId } = await readyDraft(w, { body: { brand_id: brandId, category_id: leaf } })
    await publishAndUnpublish(w, productId)
    // A platform change after it went live: a watch-listed, pending brand and an inactive category.
    await db
      .from('brands')
      .where('id', brandId)
      .update({ status: 'pending', requires_moderation: true })
    await db.from('categories').where('id', leaf).update({ is_active: false })
    const rates = await db.from('shop_shipping_rates').where('shop_id', w.shop.shopId)
    await db.from('shop_shipping_rates').where('shop_id', w.shop.shopId).delete()
    const refused = await act(w, productId, 'publish')
    assert.equal(refused.status, 422, refused.text)
    assert.deepEqual(fields(refused.body), [['shipping', 'required']])
    const still = await productRow(productId)
    assert.equal(still.status, 'unpublished')

    await db.table('shop_shipping_rates').multiInsert(rates)
    const republished = await act(w, productId, 'publish')
    assert.equal(republished.status, 200, republished.text)
    assert.equal(republished.body.data.status, 'published')
  })

  test('T-CAT-013 a product in review, rejected or blocked allows none of the four', async ({
    assert,
  }) => {
    const w = await world()
    const { productId } = await readyDraft(w)
    const states = [
      { status: 'pending_review', submitted_at: db.raw('now()') },
      { status: 'rejected', rejection_reason: 'Blurry photos' },
      { status: 'blocked' },
    ]
    for (const state of states) {
      await db.from('products').where('id', productId).update(state)
      for (const operation of ['publish', 'unpublish', 'archive', 'restore']) {
        const refused = await act(w, productId, operation)
        assert.equal(refused.status, 409, `${state.status} ${operation}`)
        assert.deepEqual(refused.body.allowed_events, [], `${state.status} ${operation}`)
      }
    }
  })

  test('T-CAT-013 unpublish, republish, archive and restore, each audited; a wrong move is 409', async ({
    assert,
  }) => {
    const w = await world()
    await configureShipping(w)
    const { productId, sku } = await readyDraft(w)
    // A draft can only be published; it cannot be archived (AC-FR-CAT-007-2).
    for (const operation of ['unpublish', 'restore', 'archive']) {
      const refused = await act(w, productId, operation)
      assert.equal(refused.status, 409, operation)
      assert.equal(refused.body.code, 'INVALID_STATE_TRANSITION')
      assert.deepEqual(refused.body.allowed_events, ['publish'], operation)
    }

    const published = await act(w, productId, 'publish')
    assert.equal(published.status, 200, published.text)
    // The test's transaction fixes now(), so the publication is moved a day back.
    await db
      .from('products')
      .where('id', productId)
      .update({
        published_at: db.raw("now() - interval '1 day'"),
        first_published_at: db.raw("now() - interval '1 day'"),
      })
    const first = await productRow(productId)
    const twice = await act(w, productId, 'publish')
    assert.equal(twice.status, 409, 'already published')
    assert.deepEqual(twice.body.allowed_events, ['unpublish', 'archive'])
    const hidden = await act(w, productId, 'unpublish')
    assert.equal(hidden.status, 200, hidden.text)
    assert.equal(hidden.body.data.status, 'unpublished')
    const again = await act(w, productId, 'publish')
    assert.equal(again.status, 200, again.text)
    const republished = await productRow(productId)
    assert.equal(
      new Date(republished.first_published_at).getTime(),
      new Date(first.first_published_at).getTime(),
      'the first publication is kept'
    )
    assert.isAbove(
      new Date(republished.published_at).getTime(),
      new Date(first.published_at).getTime(),
      'published_at moves'
    )

    const archived = await act(w, productId, 'archive')
    assert.equal(archived.status, 200, archived.text)
    assert.equal(archived.body.data.status, 'archived')
    const variants = await db.from('product_variants').where('product_id', productId)
    assert.isTrue(variants.every((variant) => variant.status === 'archived'))
    // The SKU is free again for another product of the shop (04a §7.9): readyDraft throws otherwise.
    const other = await readyDraft(w, { sku })
    const otherVariants = await db
      .from('product_variants')
      .where({ product_id: other.productId, sku, status: 'active' })
    assert.lengthOf(otherVariants, 1)
    const archivedRefused = await act(w, productId, 'unpublish')
    assert.equal(archivedRefused.status, 409)
    assert.deepEqual(archivedRefused.body.allowed_events, ['restore'])

    const restored = await act(w, productId, 'restore')
    assert.equal(restored.status, 200, restored.text)
    assert.equal(restored.body.data.status, 'draft')
    const afterRestore = await db.from('product_variants').where('product_id', productId)
    assert.isTrue(
      afterRestore.every((variant) => variant.status === 'archived'),
      'variants stay archived'
    )

    for (const [action, from, to] of [
      ['product.unpublish', 'published', 'unpublished'],
      ['product.archive', 'published', 'archived'],
      ['product.restore', 'archived', 'draft'],
    ]) {
      const [row] = await audits(productId, action)
      assert.deepEqual(row.changes, { status: { from, to } }, action)
    }
    assert.lengthOf(await audits(productId, 'product.publish'), 2)
    const finalRow = await productRow(productId)
    assert.equal(finalRow.version, 8, 'each move bumps the version')
  })

  test('T-CAT-013 a draft in a pre-mode shop, or of a watch-listed brand, goes through review', async ({
    assert,
  }) => {
    const w = await world()
    await configureShipping(w)
    const { productId } = await readyDraft(w)
    await db.from('shops').where('id', w.shop.shopId).update({ product_review_mode: 'pre' })
    const pre = await act(w, productId, 'publish')
    assert.equal(pre.status, 409, pre.text)
    assert.deepEqual(pre.body.allowed_events, ['submit'])
    await db.from('shops').where('id', w.shop.shopId).update({ product_review_mode: 'post' })
    const watched = await insertBrand('active', true)
    await db.from('products').where('id', productId).update({ brand_id: watched })
    const brand = await act(w, productId, 'publish')
    assert.equal(brand.status, 409, brand.text)
    assert.deepEqual(brand.body.allowed_events, ['submit'])
    const row = await productRow(productId)
    assert.equal(row.status, 'draft')
  })
})

test.group('T-SEC-001 T-SEC-003 T-SEC-030 T-SEC-031 product status access', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-SEC-001 another shop product is 404; T-SEC-003 a body member is unknown_field', async ({
    assert,
  }) => {
    const w = await world()
    const other = await world()
    await configureShipping(other)
    const { productId } = await readyDraft(other)
    for (const operation of ['publish', 'unpublish', 'archive', 'restore']) {
      const response = await act(w, productId, operation)
      assert.equal(response.status, 404, operation)
    }
    const row = await productRow(productId)
    assert.equal(row.status, 'draft')
    const own = await readyDraft(w)
    const withBody = await act(w, own.productId, 'publish', w.owner, { status: 'published' })
    assert.equal(withBody.status, 422)
    assert.deepEqual(fields(withBody.body), [['status', 'unknown_field']])
    const unchanged = await productRow(own.productId)
    assert.equal(unchanged.status, 'draft')
  })

  test('T-SEC-030 a viewer or fulfiller cannot publish or archive; a catalog editor and a manager can', async ({
    assert,
  }) => {
    const w = await world()
    await configureShipping(w)
    const { productId } = await readyDraft(w)
    for (const role of ['viewer', 'order_fulfiller']) {
      const browser = await signIn(await addMember(w.shop.shopId, role))
      const publish = await act(w, productId, 'publish', browser)
      assert.equal(publish.status, 403, role)
      const archive = await act(w, productId, 'archive', browser)
      assert.equal(archive.status, 403, role)
    }
    const editor = await signIn(await addMember(w.shop.shopId, 'catalog_editor'))
    const published = await act(w, productId, 'publish', editor)
    assert.equal(published.status, 200, published.text)
    const editorArchive = await act(w, productId, 'archive', editor)
    assert.equal(editorArchive.status, 200, editorArchive.text)
    const manager = await signIn(await addMember(w.shop.shopId, 'manager'))
    const restored = await act(w, productId, 'restore', manager)
    assert.equal(restored.status, 200, restored.text)
    // The restored product's variants stay archived, so the manager publishes another one.
    const second = await readyDraft(w)
    const managerPublish = await act(w, second.productId, 'publish', manager)
    assert.equal(managerPublish.status, 200, managerPublish.text)
  })

  test('T-SEC-031 a suspended shop can do none of the four', async ({ assert }) => {
    const w = await world()
    await configureShipping(w)
    const { productId } = await readyDraft(w)
    await setShopStatus(w.shop.shopId, 'suspended', 'fulfill_existing')
    for (const operation of ['publish', 'unpublish', 'archive', 'restore']) {
      const response = await act(w, productId, operation)
      assert.equal(response.status, 403, operation)
      assert.equal(response.body.code, 'SHOP_NOT_ACTIVE', operation)
    }
    const row = await productRow(productId)
    assert.equal(row.status, 'draft')
  })
})

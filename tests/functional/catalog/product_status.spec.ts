import { test } from '@japa/runner'
import { randomBytes, randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { ShopFactory } from '#database/factories/shop_factory'
import { UserFactory } from '#database/factories/user_factory'
import { refreshListing } from '#modules/catalog/jobs/refresh_listing'
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
 *   (variants, media, disclosures, required axes, shipping, and the current
 *   agreement); unpublish, republish (`first_published_at` kept), archive
 *   (every active variant archived, its SKU free again) and restore (variants
 *   stay archived) each write their audit row; a transition the status does
 *   not allow is 409 with `allowed_events`; a draft in a `pre` shop or of a
 *   watch-listed brand is 409 with `allowed_events: [submit]`.
 * - T-SEC-001: another shop's product is 404 and changes nothing.
 * - T-SEC-003: a body member is `unknown_field`.
 * - T-SEC-030: a viewer or an order fulfiller cannot publish or archive; a
 *   catalog editor can.
 * - T-SEC-031: a suspended shop cannot.
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
async function readyDraft(w: World, sku = `TEE-M-${randomUUID().slice(0, 6)}`) {
  const created = await create(w, await draftBody({ warranty_text: 'No warranty' }))
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

  test('T-CAT-013 a shop that accepted only an older agreement cannot publish', async ({
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
    // The test's transaction fixes now(), so the first publication is moved a day back.
    await db
      .from('products')
      .where('id', productId)
      .update({ first_published_at: db.raw("now() - interval '1 day'") })
    const first = await productRow(productId)
    const twice = await act(w, productId, 'publish')
    assert.equal(twice.status, 409, 'already published')
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

    const archived = await act(w, productId, 'archive')
    assert.equal(archived.status, 200, archived.text)
    assert.equal(archived.body.data.status, 'archived')
    const variants = await db.from('product_variants').where('product_id', productId)
    assert.isTrue(variants.every((variant) => variant.status === 'archived'))
    // The SKU is free again for another product of the shop (04a §7.9).
    const other = await readyDraft(w, sku)
    assert.isString(other.productId)
    const restoreRefused = await act(w, productId, 'unpublish')
    assert.deepEqual(restoreRefused.body.allowed_events, ['restore'])

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
  })

  test('T-SEC-030 a viewer or fulfiller cannot publish or archive; a catalog editor can publish', async ({
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
  })

  test('T-SEC-031 a suspended shop cannot publish', async ({ assert }) => {
    const w = await world()
    await configureShipping(w)
    const { productId } = await readyDraft(w)
    await setShopStatus(w.shop.shopId, 'suspended', 'fulfill_existing')
    const response = await act(w, productId, 'publish')
    assert.equal(response.status, 403)
    assert.equal(response.body.code, 'SHOP_NOT_ACTIVE')
  })
})

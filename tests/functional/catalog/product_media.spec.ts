import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { Browser } from '#tests/support/browser'
import {
  audits,
  create,
  draftBody,
  fields,
  jobsFor,
  productPath,
  world,
  type World,
} from '#tests/support/catalog'
import { send, signIn } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import { addMember, setShopStatus } from '#tests/support/shops'

/*
 * `replaceProductMedia` ⟳ over HTTP (docs/06 §13.5; 01 FR-MED-002; 04a
 * §7.14; R1-S part 2d-iii). Assets are inserted as the worker leaves them
 * (`ready`, or another status), as the runtime would.
 *
 * - T-MED-006: the whole gallery is replaced in order, with alt text
 *   (trimmed; empty stored as null) and a colour of an active variant; the
 *   version goes up, one `product.media_replace` row records the asset IDs
 *   before and after, and `catalog.refresh_listing` is sent; reordering and
 *   an empty list work; a set equal to the current one writes nothing. One
 *   422 lists every failing item: positions not 1 to n, a repeated asset, an
 *   asset not `ready`, a colour the product is not sold in (also the colour
 *   of an archived variant); a live product
 *   keeps at least one image; the item bounds (12 items, positions 1 to 12,
 *   150 characters, UUIDs). A `rejected` product returns to `draft`; under
 *   review, archived or blocked is 409; no `If-Match` is 428, a stale one 412
 *   with `current`.
 * - T-SEC-001: another shop's asset, an unknown asset, a KYC document of the
 *   shop, and another shop's product are 404 and change nothing.
 * - T-SEC-003: any other member, top-level or in an item, is `unknown_field`.
 * - T-SEC-030: a viewer or an order fulfiller cannot set the gallery; a
 *   catalog editor can.
 * - T-SEC-031: a suspended shop cannot.
 */

type Item = {
  media_asset_id: string
  position: number
  alt_text: string | null
  color_value_id?: string | null
}

const mediaPath = (w: World, productId: string) => `${productPath(w.shop.slug, productId)}/media`

function replace(
  w: World,
  productId: string,
  items: Item[] | unknown,
  version: number | null,
  as: Browser = w.owner
) {
  return send(
    as,
    'PUT',
    mediaPath(w, productId),
    Array.isArray(items) ? { items } : items,
    version === null ? {} : { 'If-Match': `"${version}"` }
  )
}

// An asset as the worker leaves it: `ready` by default.
async function asset(
  shopId: string,
  ownerId: string,
  status = 'ready',
  kind: 'product_image' | 'kyc_document' = 'product_image'
) {
  const processed = status === 'ready' || status === 'processing'
  const [row] = await db
    .table('media_assets')
    .insert({
      shop_id: shopId,
      kind,
      ...(kind === 'kyc_document' ? { document_type: 'pan_vat_certificate' } : {}),
      status,
      original_key: `originals/${shopId}/${randomUUID()}`,
      mime: 'image/jpeg',
      bytes: 2048,
      uploaded_by: ownerId,
      ...(processed ? { upload_etag: '"e"', upload_bytes: 2048 } : {}),
      ...(status === 'ready'
        ? {
            sha256: Buffer.alloc(32),
            processed_at: db.raw('now()'),
            width: 800,
            height: 800,
            ...(kind === 'product_image'
              ? { derived_keys: JSON.stringify({ 320: 'p/x/y-320.webp' }) }
              : {}),
          }
        : {}),
      ...(status === 'rejected' ? { rejection_reason: 'The file is empty.' } : {}),
    })
    .returning('id')
  return row.id as string
}

async function colourValue(code: string) {
  const row = await db
    .from('attribute_values as v')
    .join('attributes as a', 'a.id', 'v.attribute_id')
    .where({ 'a.code': 'color', 'v.code': code })
    .select('v.id')
    .firstOrFail()
  return row.id as string
}

// A draft sold in black (one variant on the `color` axis), at version 2.
async function blackDraft(w: World) {
  const created = await create(w, await draftBody())
  const product = created.body.data as { id: string }
  const variants = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, product.id)}/variants`,
    {
      option_axes: ['color'],
      variants: [{ option_value_codes: { color: 'black' }, sku: 'TEE-BLK', price_minor: 129900 }],
    },
    { 'If-Match': '"1"' }
  )
  if (variants.status !== 200) throw new Error(`variants: ${variants.text}`)
  return product.id
}

const productRow = (id: string) => db.from('products').where('id', id).firstOrFail()
const galleryRows = (productId: string) =>
  db.from('product_media').where('product_id', productId).orderBy('position')

test.group('T-MED-006 replaceProductMedia', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-MED-006 the gallery is set in order with alt text and a colour; version, audit, listing', async ({
    assert,
  }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const black = await colourValue('black')
    const front = await asset(w.shop.shopId, w.shop.ownerId)
    const back = await asset(w.shop.shopId, w.shop.ownerId)
    const jobsBefore = await jobsFor(productId)

    const response = await replace(
      w,
      productId,
      [
        { media_asset_id: back, position: 2, alt_text: '  Back view  ', color_value_id: black },
        { media_asset_id: front, position: 1, alt_text: '   ' },
      ],
      2
    )
    assert.equal(response.status, 200, response.text)
    assert.equal(response.headers.get('etag'), '"3"')
    assert.equal(response.body.data.version, 3)
    assert.deepEqual(response.body.data.media, [
      // Each image carries its public derivatives' keys, for the editor's gallery (R1-S part 2g-i).
      {
        media_asset_id: front,
        position: 1,
        alt_text: null,
        color_value_id: null,
        keys: { 320: 'p/x/y-320.webp' },
      },
      {
        media_asset_id: back,
        position: 2,
        alt_text: 'Back view',
        color_value_id: black,
        keys: { 320: 'p/x/y-320.webp' },
      },
    ])
    assert.notInclude(response.body.data.missing_for_submit, 'media')
    const rows = await galleryRows(productId)
    assert.deepEqual(
      rows.map((row) => [row.media_asset_id, row.position, row.alt_text, row.color_value_id]),
      [
        [front, 1, null, null],
        [back, 2, 'Back view', black],
      ]
    )
    // A gallery image that is no longer ready shows no keys (R1-S part 2g-i).
    await db.from('media_assets').where('id', back).update({ status: 'deleted' })
    const read = await send(w.owner, 'GET', productPath(w.shop.slug, productId))
    const media = read.body.data.media as { media_asset_id: string; keys: unknown }[]
    assert.isNull(media.find((item) => item.media_asset_id === back)?.keys)
    await db.from('media_assets').where('id', back).update({ status: 'ready' })
    const [audit, ...more] = await audits(productId, 'product.media_replace')
    assert.lengthOf(more, 0)
    assert.deepEqual(audit.changes, {
      media_asset_ids: { from: [], to: [front, back] },
      changed: ['media_asset_ids'],
    })
    assert.notInclude(JSON.stringify(audit.changes), 'Back view')
    assert.lengthOf(await jobsFor(productId), jobsBefore.length + 1)
  })

  test('T-MED-006 a reorder and an empty list replace the set; the same set writes nothing', async ({
    assert,
  }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const first = await asset(w.shop.shopId, w.shop.ownerId)
    const second = await asset(w.shop.shopId, w.shop.ownerId)
    const set = [
      { media_asset_id: first, position: 1, alt_text: null },
      { media_asset_id: second, position: 2, alt_text: null },
    ]
    const firstSet = await replace(w, productId, set, 2)
    assert.equal(firstSet.status, 200, firstSet.text)

    const same = await replace(w, productId, set, 3)
    assert.equal(same.status, 200, same.text)
    assert.equal(same.headers.get('etag'), '"3"', 'the version stays')
    assert.lengthOf(await audits(productId, 'product.media_replace'), 1)

    const swapped = await replace(
      w,
      productId,
      [
        { media_asset_id: second, position: 1, alt_text: null },
        { media_asset_id: first, position: 2, alt_text: null },
      ],
      3
    )
    assert.equal(swapped.status, 200, swapped.text)
    const order = await galleryRows(productId)
    assert.deepEqual(
      order.map((row) => row.media_asset_id),
      [second, first]
    )

    const cleared = await replace(w, productId, [], 4)
    assert.equal(cleared.status, 200, cleared.text)
    assert.deepEqual(cleared.body.data.media, [])
    assert.lengthOf(await galleryRows(productId), 0)
    const audit = await audits(productId, 'product.media_replace')
    assert.deepEqual(audit.at(-1)?.changes.media_asset_ids, { from: [second, first], to: [] })
  })

  test('T-MED-006 an alt text or a colour alone is a change; the same text with spaces is not', async ({
    assert,
  }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const black = await colourValue('black')
    const image = await asset(w.shop.shopId, w.shop.ownerId)
    const set = (alt: string | null, colour: string | null) => [
      { media_asset_id: image, position: 1, alt_text: alt, color_value_id: colour },
    ]
    const first = await replace(w, productId, set('Front', null), 2)
    assert.equal(first.headers.get('etag'), '"3"', first.text)
    const spaced = await replace(w, productId, set('  Front  ', null), 3)
    assert.equal(spaced.headers.get('etag'), '"3"', 'trimmed, it is the stored text')
    const altOnly = await replace(w, productId, set('Front view', null), 3)
    assert.equal(altOnly.headers.get('etag'), '"4"')
    const colourOnly = await replace(w, productId, set('Front view', black), 4)
    assert.equal(colourOnly.headers.get('etag'), '"5"')
    const rows = await audits(productId, 'product.media_replace')
    assert.deepEqual(
      rows.map((row) => row.changes.changed),
      [['media_asset_ids'], ['alt_text'], ['color_value_id']]
    )
    assert.deepEqual(rows[1].changes.media_asset_ids, { from: [image], to: [image] })
  })

  test('T-MED-006 IDs in upper case name the same asset and colour', async ({ assert }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const black = await colourValue('black')
    const image = await asset(w.shop.shopId, w.shop.ownerId)
    const upper = await replace(
      w,
      productId,
      [
        {
          media_asset_id: image.toUpperCase(),
          position: 1,
          alt_text: null,
          color_value_id: black.toUpperCase(),
        },
      ],
      2
    )
    assert.equal(upper.status, 200, upper.text)
    assert.deepEqual(upper.body.data.media, [
      {
        media_asset_id: image,
        position: 1,
        alt_text: null,
        color_value_id: black,
        keys: { 320: 'p/x/y-320.webp' },
      },
    ])
    const twice = await replace(
      w,
      productId,
      [
        { media_asset_id: image, position: 1, alt_text: null },
        { media_asset_id: image.toUpperCase(), position: 2, alt_text: null },
      ],
      3
    )
    assert.equal(twice.status, 422, twice.text)
    assert.deepEqual(fields(twice.body), [['items.1.media_asset_id', 'duplicate']])
  })

  test('T-MED-006 one 422 lists every failing item, and nothing is written', async ({ assert }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const white = await colourValue('white')
    const ready = await asset(w.shop.shopId, w.shop.ownerId)
    const checking = await asset(w.shop.shopId, w.shop.ownerId, 'processing')
    const refusedFile = await asset(w.shop.shopId, w.shop.ownerId, 'rejected')
    const response = await replace(
      w,
      productId,
      [
        { media_asset_id: ready, position: 1, alt_text: null },
        { media_asset_id: ready, position: 3, alt_text: null },
        { media_asset_id: checking, position: 4, alt_text: null, color_value_id: white },
        { media_asset_id: refusedFile, position: 4, alt_text: null },
      ],
      2
    )
    assert.equal(response.status, 422, response.text)
    assert.sameDeepMembers(fields(response.body), [
      ['items', 'positions'],
      ['items.1.media_asset_id', 'duplicate'],
      ['items.2.color_value_id', 'not_allowed'],
      ['items.2.media_asset_id', 'not_ready'],
      ['items.3.media_asset_id', 'not_ready'],
    ])
    assert.lengthOf(await galleryRows(productId), 0)
    const row = await productRow(productId)
    assert.equal(row.version, 2)
  })

  test('T-MED-006 an image links only to the colour of an active variant', async ({ assert }) => {
    const w = await world()
    const created = await create(w, await draftBody())
    const productId = created.body.data.id as string
    const variants = await send(
      w.owner,
      'PUT',
      `${productPath(w.shop.slug, productId)}/variants`,
      {
        option_axes: ['color'],
        variants: [
          { option_value_codes: { color: 'black' }, sku: 'TEE-BLK', price_minor: 129900 },
          { option_value_codes: { color: 'white' }, sku: 'TEE-WHT', price_minor: 129900 },
        ],
      },
      { 'If-Match': '"1"' }
    )
    assert.equal(variants.status, 200, variants.text)
    const white = variants.body.data.variants.find(
      (variant: { sku: string }) => variant.sku === 'TEE-WHT'
    )
    await db.from('product_variants').where('id', white.id).update({ status: 'archived' })
    const image = await asset(w.shop.shopId, w.shop.ownerId)
    const toWhite = await replace(
      w,
      productId,
      [
        {
          media_asset_id: image,
          position: 1,
          alt_text: null,
          color_value_id: await colourValue('white'),
        },
      ],
      2
    )
    assert.equal(toWhite.status, 422, toWhite.text)
    assert.deepEqual(fields(toWhite.body), [['items.0.color_value_id', 'not_allowed']])
    const toBlack = await replace(
      w,
      productId,
      [
        {
          media_asset_id: image,
          position: 1,
          alt_text: null,
          color_value_id: await colourValue('black'),
        },
      ],
      2
    )
    assert.equal(toBlack.status, 200, toBlack.text)
  })

  test('T-MED-006 a product on sale keeps at least one image; a draft may have none', async ({
    assert,
  }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const image = await asset(w.shop.shopId, w.shop.ownerId)
    const withImage = await replace(
      w,
      productId,
      [{ media_asset_id: image, position: 1, alt_text: null }],
      2
    )
    assert.equal(withImage.status, 200, withImage.text)
    for (const status of ['unpublished', 'published'] as const) {
      await db
        .from('products')
        .where('id', productId)
        .update({
          status,
          warranty_text: 'No warranty',
          published_at: db.raw('now()'),
          first_published_at: db.raw('now()'),
        })
      const emptied = await replace(w, productId, [], 3)
      assert.equal(emptied.status, 422, `${status}: ${emptied.text}`)
      assert.deepEqual(fields(emptied.body), [['items', 'required']])
    }
    assert.lengthOf(await galleryRows(productId), 1)
  })

  test('T-MED-006 the item bounds: 12 items, positions 1 to 12, 150 characters, UUIDs', async ({
    assert,
  }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const image = await asset(w.shop.shopId, w.shop.ownerId)
    const thirteen = Array.from({ length: 13 }, (_, index) => ({
      media_asset_id: randomUUID(),
      position: Math.min(index + 1, 12),
      alt_text: null,
    }))
    const tooMany = await replace(w, productId, thirteen, 2)
    assert.equal(tooMany.status, 422)
    assert.deepEqual(
      fields(tooMany.body).map(([field]) => field),
      ['items']
    )
    const bounds = await replace(
      w,
      productId,
      [
        { media_asset_id: image, position: 0, alt_text: 'x'.repeat(151) },
        { media_asset_id: 'not-a-uuid', position: 13, alt_text: null, color_value_id: 'nope' },
      ],
      2
    )
    assert.equal(bounds.status, 422)
    assert.sameDeepMembers(
      fields(bounds.body).map(([field]) => field),
      [
        'items.0.position',
        'items.0.alt_text',
        'items.1.media_asset_id',
        'items.1.position',
        'items.1.color_value_id',
      ]
    )
    assert.lengthOf(await galleryRows(productId), 0)
  })

  test('T-MED-006 a rejected product returns to draft; under review, archived or blocked is 409', async ({
    assert,
  }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const image = await asset(w.shop.shopId, w.shop.ownerId)
    const items = [{ media_asset_id: image, position: 1, alt_text: null }]
    await db
      .from('products')
      .where('id', productId)
      .update({ status: 'rejected', rejection_reason: 'No photo' })
    const fixed = await replace(w, productId, items, 2)
    assert.equal(fixed.status, 200, fixed.text)
    assert.equal(fixed.body.data.status, 'draft')
    const [audit] = await audits(productId, 'product.media_replace')
    assert.deepEqual(audit.changes.status, { from: 'rejected', to: 'draft' })

    await db
      .from('products')
      .where('id', productId)
      .update({ warranty_text: 'No warranty', submitted_at: db.raw('now()') })
    for (const status of ['pending_review', 'archived', 'blocked'] as const) {
      await db.from('products').where('id', productId).update({ status })
      const refusedReplace = await replace(w, productId, [], 3)
      assert.equal(refusedReplace.status, 409, status)
      assert.equal(refusedReplace.body.code, 'INVALID_STATE_TRANSITION')
    }
    assert.lengthOf(await galleryRows(productId), 1)
  })

  test('T-MED-006 no If-Match is 428; a stale one is 412 with the current product', async ({
    assert,
  }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const image = await asset(w.shop.shopId, w.shop.ownerId)
    const items = [{ media_asset_id: image, position: 1, alt_text: null }]
    const missing = await replace(w, productId, items, null)
    assert.equal(missing.status, 428)
    const stale = await replace(w, productId, items, 1)
    assert.equal(stale.status, 412)
    assert.equal(stale.body.current.version, 2)
    assert.lengthOf(await galleryRows(productId), 0)
  })
})

test.group('T-SEC-001 replaceProductMedia scope', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-SEC-001 another shop asset, an unknown one, a KYC document, another shop product: 404', async ({
    assert,
  }) => {
    const w = await world()
    const other = await world()
    const productId = await blackDraft(w)
    const foreign = await asset(other.shop.shopId, other.shop.ownerId)
    const kyc = await asset(w.shop.shopId, w.shop.ownerId, 'ready', 'kyc_document')
    const own = await asset(w.shop.shopId, w.shop.ownerId)
    const responses = []
    for (const id of [foreign, randomUUID(), kyc]) {
      responses.push(
        await replace(
          w,
          productId,
          [
            { media_asset_id: own, position: 1, alt_text: null },
            { media_asset_id: id, position: 2, alt_text: null },
          ],
          2
        )
      )
    }
    const otherProduct = await blackDraft(other)
    responses.push(
      await replace(w, otherProduct, [{ media_asset_id: own, position: 1, alt_text: null }], 2)
    )
    for (const response of responses) {
      assert.equal(response.status, 404, response.text)
      assert.equal(response.body.code, 'NOT_FOUND')
    }
    const { request_id: foreignRequest, ...foreignBody } = responses[0].body
    const { request_id: unknownRequest, ...unknownBody } = responses[1].body
    assert.notEqual(foreignRequest, unknownRequest)
    assert.deepEqual(foreignBody, unknownBody, 'another shop’s asset looks missing')
    assert.lengthOf(await galleryRows(productId), 0)
    assert.lengthOf(await galleryRows(otherProduct), 0)
    const row = await productRow(productId)
    assert.equal(row.version, 2)
  })
})

test.group('T-SEC-003 replaceProductMedia members', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-SEC-003 any other member, top-level or in an item, is unknown_field', async ({
    assert,
  }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const image = await asset(w.shop.shopId, w.shop.ownerId)
    // Top-level members are refused first, as for the other whole-set replacements.
    const topLevel = await replace(
      w,
      productId,
      { items: [{ media_asset_id: image, position: 1, alt_text: null }], product_id: productId },
      2
    )
    assert.equal(topLevel.status, 422)
    assert.deepEqual(fields(topLevel.body), [['product_id', 'unknown_field']])
    const inItem = await replace(
      w,
      productId,
      {
        items: [
          { media_asset_id: image, position: 1, alt_text: null, shop_id: w.shop.shopId },
          { media_asset_id: image, position: 2, alt_text: null, status: 'ready' },
        ],
      },
      2
    )
    assert.equal(inItem.status, 422)
    assert.sameDeepMembers(fields(inItem.body), [
      ['items.0.shop_id', 'unknown_field'],
      ['items.1.status', 'unknown_field'],
    ])
    assert.lengthOf(await galleryRows(productId), 0)
  })
})

test.group('T-SEC-030 T-SEC-031 replaceProductMedia access', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-SEC-030 a viewer or fulfiller cannot set the gallery; a catalog editor can', async ({
    assert,
  }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const image = await asset(w.shop.shopId, w.shop.ownerId)
    const items = [{ media_asset_id: image, position: 1, alt_text: null }]
    for (const role of ['viewer', 'order_fulfiller']) {
      const browser = await signIn(await addMember(w.shop.shopId, role))
      const refusedReplace = await replace(w, productId, items, 2, browser)
      assert.equal(refusedReplace.status, 403, role)
    }
    assert.lengthOf(await galleryRows(productId), 0)
    const editor = await signIn(await addMember(w.shop.shopId, 'catalog_editor'))
    const allowed = await replace(w, productId, items, 2, editor)
    assert.equal(allowed.status, 200, allowed.text)
  })

  test('T-SEC-031 a suspended shop cannot set the gallery', async ({ assert }) => {
    const w = await world()
    const productId = await blackDraft(w)
    const image = await asset(w.shop.shopId, w.shop.ownerId)
    await setShopStatus(w.shop.shopId, 'suspended', 'fulfill_existing')
    const response = await replace(
      w,
      productId,
      [{ media_asset_id: image, position: 1, alt_text: null }],
      2
    )
    assert.equal(response.status, 403)
    assert.equal(response.body.code, 'SHOP_NOT_ACTIVE')
    assert.lengthOf(await galleryRows(productId), 0)
  })
})

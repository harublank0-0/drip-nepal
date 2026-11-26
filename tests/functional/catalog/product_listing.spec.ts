import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { rebuildListings } from '#modules/catalog/jobs/rebuild_listings'
import { refreshListing } from '#modules/catalog/jobs/refresh_listing'
import { create, draftBody, productPath, world, type World } from '#tests/support/catalog'
import { send } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import { setShopStatus } from '#tests/support/shops'

/*
 * The listing read model (docs/04a §7.12, ADR-0014; R1-S part 2e-i). The
 * product is built through the real operations (draft, variants, gallery),
 * then published by setting its status directly, as `publishProduct` (part
 * 2e-ii) will.
 *
 * - T-CAT-108: a row exists exactly when the product is visible: it is
 *   removed when the product is unpublished, the shop suspended, the
 *   gallery emptied or every variant archived, and a refresh after a stock
 *   change updates it; the nightly rebuild adds a missing row and removes a
 *   stale one.
 * - T-CAT-012: the row's contents: the shop, product, category (names
 *   along the path) and audience; size and colour values only of active
 *   variants with stock to sell; prices over the active variants and the
 *   cheapest one's compare-at price; `in_stock`; the primary image's keys
 *   and its alt text, or "{title}, {colour}"; `published_at`; and a search
 *   vector that finds the title, the category and the shop.
 */

const KEYS = { 320: 'p/x/abcdef0123456789-320.webp', 640: 'p/x/abcdef0123456789-640.webp' }

async function valueId(attribute: string, code: string) {
  const row = await db
    .from('attribute_values as v')
    .join('attributes as a', 'a.id', 'v.attribute_id')
    .where({ 'a.code': attribute, 'v.code': code })
    .select('v.id')
    .firstOrFail()
  return row.id as string
}

async function readyAsset(shopId: string, ownerId: string, keys: object = KEYS) {
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
      derived_keys: JSON.stringify(keys),
      width: 800,
      height: 800,
      uploaded_by: ownerId,
    })
    .returning('id')
  return row.id as string
}

type Listed = { productId: string; variants: Record<string, string>; image: string }

/*
 * A published product: black M (3 to sell), black L (2 on hand, both
 * reserved), white M (none on hand), one image linked to black, no alt text.
 */
async function publishedProduct(w: World): Promise<Listed> {
  // SKUs are unique within a shop, and a test may publish two products in one shop.
  const suffix = randomUUID().slice(0, 6).toUpperCase()
  const created = await create(w, await draftBody())
  const productId = created.body.data.id as string
  const variants = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, productId)}/variants`,
    {
      option_axes: ['color', 'apparel_size'],
      variants: [
        {
          option_value_codes: { color: 'black', apparel_size: 'm' },
          sku: `TEE-BLK-M-${suffix}`,
          price_minor: 129900,
          compare_at_price_minor: 159900,
        },
        {
          option_value_codes: { color: 'black', apparel_size: 'l' },
          sku: `TEE-BLK-L-${suffix}`,
          price_minor: 139900,
        },
        {
          option_value_codes: { color: 'white', apparel_size: 'm' },
          sku: `TEE-WHT-M-${suffix}`,
          price_minor: 149900,
        },
      ],
    },
    { 'If-Match': '"1"' }
  )
  if (variants.status !== 200) throw new Error(`variants: ${variants.text}`)
  const bySku: Record<string, string> = {}
  for (const variant of variants.body.data.variants as { id: string; sku: string }[]) {
    bySku[variant.sku.replace(`-${suffix}`, '')] = variant.id
  }
  await db.from('inventory_items').where('variant_id', bySku['TEE-BLK-M']).update({ on_hand: 3 })
  await db
    .from('inventory_items')
    .where('variant_id', bySku['TEE-BLK-L'])
    .update({ on_hand: 2, reserved: 2 })
  const image = await readyAsset(w.shop.shopId, w.shop.ownerId)
  const media = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, productId)}/media`,
    {
      items: [
        {
          media_asset_id: image,
          position: 1,
          alt_text: null,
          color_value_id: await valueId('color', 'black'),
        },
      ],
    },
    { 'If-Match': '"2"' }
  )
  if (media.status !== 200) throw new Error(`media: ${media.text}`)
  await db
    .from('products')
    .where('id', productId)
    .update({
      status: 'published',
      warranty_text: 'No warranty',
      published_at: db.raw("now() - interval '1 hour'"),
      first_published_at: db.raw("now() - interval '1 hour'"),
    })
  return { productId, variants: bySku, image }
}

const listing = (productId: string) =>
  db.from('product_listings').where('product_id', productId).first()

test.group('T-CAT-012 the listing row', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-CAT-012 the row copies the product, counts only stock to sell, and finds it by search', async ({
    assert,
  }) => {
    const w = await world()
    const { productId } = await publishedProduct(w)
    assert.deepEqual(await refreshListing({ product_id: productId }), { outcome: 'listed' })
    const row = await listing(productId)
    const product = await db.from('products').where('id', productId).firstOrFail()
    const category = await db.from('categories').where('id', product.category_id).firstOrFail()
    assert.include(row, {
      shop_id: w.shop.shopId,
      shop_slug: w.shop.slug,
      shop_name: w.shop.name,
      public_id: product.public_id,
      slug: product.slug,
      title: 'Organic cotton crew tee',
      category_id: category.id,
      category_path: category.path,
      brand_id: null,
      brand_name: null,
      brand_slug: null,
      min_price_minor: 129900,
      max_price_minor: 149900,
      compare_at_price_minor: 159900,
      currency: 'NPR',
      in_stock: true,
      primary_image_alt: 'Organic cotton crew tee, Black',
    })
    // The names along the path, root first, for search.
    const ancestors = await db
      .from('categories')
      .whereRaw('? LIKE path || ?', [category.path, '%'])
      .orderBy('depth')
      .select('name')
    assert.equal(row.category_names, ancestors.map((ancestor) => ancestor.name).join(' '))
    assert.isAbove(ancestors.length, 1)
    assert.sameMembers(row.audience_value_ids, [
      await valueId('audience', 'men'),
      await valueId('audience', 'women'),
    ])
    // Black M is the only variant with stock to sell: black L is all reserved, white M empty.
    assert.deepEqual(row.size_value_ids, [await valueId('apparel_size', 'm')])
    assert.deepEqual(row.color_value_ids, [await valueId('color', 'black')])
    assert.deepEqual(row.primary_image_keys, KEYS)
    assert.equal(new Date(row.published_at).getTime(), new Date(product.published_at).getTime())
    for (const word of ['crew', ancestors[0].name.split(' ')[0], w.shop.name.split(' ')[0]]) {
      const found = await db
        .from('product_listings')
        .where('product_id', productId)
        .whereRaw(`search_tsv @@ websearch_to_tsquery('simple', ?)`, [word])
      assert.lengthOf(found, 1, `search for ${word}`)
    }
  })

  test('T-CAT-012 the primary image is the one at position 1', async ({ assert }) => {
    const w = await world()
    const { productId, image } = await publishedProduct(w)
    const secondKeys = { 320: 'p/y/0011223344556677-320.webp' }
    const second = await readyAsset(w.shop.shopId, w.shop.ownerId, secondKeys)
    const response = await send(
      w.owner,
      'PUT',
      `${productPath(w.shop.slug, productId)}/media`,
      {
        items: [
          { media_asset_id: second, position: 1, alt_text: 'Back of the tee' },
          { media_asset_id: image, position: 2, alt_text: 'Front of the tee' },
        ],
      },
      { 'If-Match': '"3"' }
    )
    assert.equal(response.status, 200, response.text)
    await refreshListing({ product_id: productId })
    const row = await listing(productId)
    assert.equal(row.primary_image_alt, 'Back of the tee')
    assert.deepEqual(row.primary_image_keys, secondKeys)
  })

  test('T-CAT-012 the alt text wins over the fallback; an image without a colour falls back to the title', async ({
    assert,
  }) => {
    const w = await world()
    const { productId, image } = await publishedProduct(w)
    const set = async (alt: string | null, colour: string | null, version: number) => {
      const response = await send(
        w.owner,
        'PUT',
        `${productPath(w.shop.slug, productId)}/media`,
        { items: [{ media_asset_id: image, position: 1, alt_text: alt, color_value_id: colour }] },
        { 'If-Match': `"${version}"` }
      )
      assert.equal(response.status, 200, response.text)
      await refreshListing({ product_id: productId })
      const row = await listing(productId)
      return row.primary_image_alt as string
    }
    assert.equal(await set('Front of the tee', null, 3), 'Front of the tee')
    assert.equal(await set(null, null, 4), 'Organic cotton crew tee')
  })
})

test.group('T-CAT-108 the row exists exactly when the product is visible', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-CAT-108 unpublished, a suspended shop, no image or no active variant: no row', async ({
    assert,
  }) => {
    const cases: [string, (w: World, listed: Listed) => Promise<unknown>][] = [
      [
        'unpublished',
        (_w, listed) =>
          db.from('products').where('id', listed.productId).update({ status: 'unpublished' }),
      ],
      ['shop suspended', (w) => setShopStatus(w.shop.shopId, 'suspended', 'fulfill_existing')],
      [
        'no image',
        (_w, listed) => db.from('product_media').where('product_id', listed.productId).delete(),
      ],
      [
        'no active variant',
        (_w, listed) =>
          db
            .from('product_variants')
            .where('product_id', listed.productId)
            .update({ status: 'archived' }),
      ],
    ]
    for (const [label, hide] of cases) {
      const w = await world()
      const listed = await publishedProduct(w)
      await refreshListing({ product_id: listed.productId })
      assert.isOk(await listing(listed.productId), `${label}: listed first`)
      await hide(w, listed)
      assert.deepEqual(await refreshListing({ product_id: listed.productId }), {
        outcome: 'not_visible',
      })
      assert.notExists(await listing(listed.productId), label)
    }
  })

  test('T-CAT-108 a refresh after a stock change updates the row', async ({ assert }) => {
    const w = await world()
    const listed = await publishedProduct(w)
    await refreshListing({ product_id: listed.productId })
    await db
      .from('inventory_items')
      .where('variant_id', listed.variants['TEE-BLK-M'])
      .update({ on_hand: 0 })
    await refreshListing({ product_id: listed.productId })
    const soldOut = await listing(listed.productId)
    assert.isFalse(soldOut.in_stock)
    assert.deepEqual(soldOut.size_value_ids, [])
    assert.deepEqual(soldOut.color_value_ids, [])
    assert.equal(soldOut.min_price_minor, 129900, 'a sold-out variant still has its price')
    await db
      .from('inventory_items')
      .where('variant_id', listed.variants['TEE-WHT-M'])
      .update({ on_hand: 1 })
    await refreshListing({ product_id: listed.productId })
    const white = await listing(listed.productId)
    assert.isTrue(white.in_stock)
    assert.deepEqual(white.color_value_ids, [await valueId('color', 'white')])
  })

  test('T-CAT-108 the nightly rebuild adds a missing row and removes a stale one', async ({
    assert,
  }) => {
    const w = await world()
    const missing = await publishedProduct(w)
    const stale = await publishedProduct(w)
    await refreshListing({ product_id: stale.productId })
    // Changed without a refresh, as a lost job would leave them.
    await db.from('products').where('id', stale.productId).update({ status: 'unpublished' })
    const counts = await rebuildListings('req-rebuild')
    assert.isAtLeast(counts.listed, 1)
    assert.equal(counts.failed, 0)
    assert.isOk(await listing(missing.productId))
    assert.notExists(await listing(stale.productId))
  })
})

import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { clientNetwork, rateLimiter, rateLimitKey } from '#modules/platform/rate_limits'
import { testBrowser } from '#tests/support/browser'
import {
  create,
  draftBody,
  insertBrand,
  productPath,
  world,
  type World,
} from '#tests/support/catalog'
import { send } from '#tests/support/courier_http'
import { forgetKeys, getJson, randomIPv4, type Guest } from '#tests/support/identity'
import { useJobBoss } from '#tests/support/jobs'
import { setShopStatus } from '#tests/support/shops'

/*
 * The storefront product over HTTP (docs/06 §13.2 `getProduct`; 08 §11.2;
 * 01 FR-CAT-012, AC-FR-SRCH-004-2 to -4, AC-FR-SHOP-013-4 as reconciled;
 * R1-S part 3c), T-CAT-016. The product is made through the real draft,
 * variants, gallery and publish operations; its stock is set on its rows.
 *
 * - A published product of an active shop answers its category path, brand
 *   (null for own label), the shop's name and return policy, its attributes
 *   and disclosures, its axes colour first with only the values an active
 *   variant offers, every active variant with its prices, `in_stock` and
 *   `available_capped` (at most 10), the gallery by position with alt text
 *   or its fallback, and the shop's zone rates.
 * - A draft, unpublished or archived product, a product of a suspended shop,
 *   and an unknown or malformed public ID are 404; a query parameter is 400.
 * - Each call takes a `catalog_ip` point.
 */

const networks: string[] = []

async function forgetNetworks() {
  for (const network of networks.splice(0)) await forgetKeys('catalog_ip', network)
}

function visitor(): Guest {
  const ip = randomIPv4()
  networks.push(clientNetwork(ip))
  return { browser: testBrowser(), ip }
}

const productUrl = (publicId: string) => `/api/v1/catalog/products/${publicId}`
const read = (publicId: string, query = '') => getJson(visitor(), `${productUrl(publicId)}${query}`)
async function statusOf(publicId: string) {
  const response = await read(publicId)
  return response.status
}

async function valueId(attribute: string, code: string) {
  const row = await db
    .from('attribute_values as v')
    .join('attributes as a', 'a.id', 'v.attribute_id')
    .where({ 'a.code': attribute, 'v.code': code })
    .select('v.id')
    .firstOrFail()
  return row.id as string
}

async function readyAsset(shopId: string, ownerId: string, width: number) {
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
      derived_keys: JSON.stringify({ [width]: `p/x/abcdef0123456789-${width}.webp` }),
      width: 800,
      height: 800,
      uploaded_by: ownerId,
    })
    .returning('id')
  return row.id as string
}

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

const act = (w: World, productId: string, operation: string) =>
  send(w.owner, 'POST', `${productPath(w.shop.slug, productId)}/${operation}`, {})

type Made = { productId: string; publicId: string; variants: Map<string, string> }

/*
 * A published tee varying by colour and size: black M (3 in stock), black L
 * (none), white M (15). Two images: the first without alt text or colour,
 * the second for black with alt text.
 */
async function publishedTee(w: World): Promise<Made> {
  await configureShipping(w)
  const created = await create(w, await draftBody({ warranty_text: 'No warranty' }))
  if (created.status !== 201) throw new Error(`create: ${created.text}`)
  const productId = created.body.data.id as string
  const publicId = created.body.data.public_id as string
  const suffix = randomUUID().slice(0, 6)
  const variants = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, productId)}/variants`,
    {
      // Size first: the answer still puts colour first (08 §11.2).
      option_axes: ['apparel_size', 'color'],
      variants: [
        {
          option_value_codes: { color: 'black', apparel_size: 'm' },
          sku: `BM-${suffix}`,
          price_minor: 129900,
          compare_at_price_minor: 159900,
        },
        {
          option_value_codes: { color: 'black', apparel_size: 'l' },
          sku: `BL-${suffix}`,
          price_minor: 139900,
        },
        {
          option_value_codes: { color: 'white', apparel_size: 'm' },
          sku: `WM-${suffix}`,
          price_minor: 129900,
        },
      ],
    },
    { 'If-Match': '"1"' }
  )
  if (variants.status !== 200) throw new Error(`variants: ${variants.text}`)
  const rows = await db
    .from('product_variants')
    .where({ product_id: productId, status: 'active' })
    .select('id', 'sku')
  const bySku = new Map(rows.map((row) => [(row.sku as string).slice(0, 2), row.id as string]))
  for (const [code, onHand] of [
    ['BM', 3],
    ['BL', 0],
    ['WM', 15],
  ] as const) {
    await db
      .from('inventory_items')
      .where('variant_id', bySku.get(code)!)
      .update({ on_hand: onHand })
  }
  // Black M: 1 of its 3 is reserved, so 2 are to sell.
  await db.from('inventory_items').where('variant_id', bySku.get('BM')!).update({ reserved: 1 })
  const first = await readyAsset(w.shop.shopId, w.shop.ownerId, 320)
  const second = await readyAsset(w.shop.shopId, w.shop.ownerId, 640)
  const media = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, productId)}/media`,
    {
      // Sent out of order: the answer follows position.
      items: [
        {
          media_asset_id: second,
          position: 2,
          alt_text: 'Black tee, back',
          color_value_id: await valueId('color', 'black'),
        },
        { media_asset_id: first, position: 1, alt_text: null },
      ],
    },
    { 'If-Match': '"2"' }
  )
  if (media.status !== 200) throw new Error(`media: ${media.text}`)
  const published = await act(w, productId, 'publish')
  if (published.status !== 200) throw new Error(`publish: ${published.text}`)
  return { productId, publicId, variants: bySku }
}

test.group('T-CAT-016 the storefront product', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.teardown(forgetNetworks)

  test('T-CAT-016 a published product answers everything its page shows', async ({ assert }) => {
    const w = await world()
    const made = await publishedTee(w)
    const response = await read(made.publicId)
    assert.equal(response.status, 200, response.text)
    const product = response.body.data
    assert.equal(product.public_id, made.publicId)
    assert.equal(product.title, 'Organic cotton crew tee')
    assert.equal(product.description, '180 gsm, pre-shrunk.')
    assert.deepEqual(product.categories, [
      { slug: 'clothing', name: 'Clothing' },
      { slug: 'tops', name: 'Tops' },
      { slug: 't-shirts', name: 'T-Shirts' },
    ])
    assert.isNull(product.brand)
    assert.deepEqual(product.shop, {
      slug: w.shop.slug,
      name: w.shop.name,
      return_policy: 'Returns within 7 days, unworn and with tags.',
    })
    assert.deepEqual(product.attributes, [
      {
        code: 'audience',
        name: 'Audience',
        values: [
          { code: 'men', label: 'Men' },
          { code: 'women', label: 'Women' },
        ],
      },
      { code: 'material', name: 'Material', values: [{ code: 'cotton', label: 'Cotton' }] },
    ])
    assert.deepEqual(product.disclosures, {
      manufacturer_name: 'Kathmandu Threads Pvt. Ltd.',
      is_imported: false,
      country_of_origin: null,
      warranty_text: 'No warranty',
      care_and_precautions: 'Wash cold, dry in shade.',
    })
    assert.deepEqual(
      product.option_axes.map((axis: { code: string; values: { code: string }[] }) => [
        axis.code,
        axis.values.map((value) => value.code),
      ]),
      [
        ['color', ['black', 'white']],
        ['apparel_size', ['m', 'l']],
      ]
    )
    assert.deepEqual(
      product.option_axes.map((axis: { name: string }) => axis.name),
      ['Colour', 'Size']
    )
    assert.deepEqual(product.option_axes[0].values[0], {
      code: 'black',
      label: 'Black',
      swatch_hex: '#111111',
    })
    const variant = (code: string) =>
      product.variants.find((item: { id: string }) => item.id === made.variants.get(code))
    assert.deepEqual(variant('BM'), {
      id: made.variants.get('BM'),
      option_values: { color: 'black', apparel_size: 'm' },
      price: { amount_minor: 129900, currency: 'NPR' },
      compare_at: { amount_minor: 159900, currency: 'NPR' },
      weight_grams: null,
      in_stock: true,
      available_capped: 2,
    })
    assert.include(variant('BL'), { in_stock: false, available_capped: 0 })
    // Fifteen in stock is published as ten.
    assert.include(variant('WM'), { in_stock: true, available_capped: 10 })
    assert.deepEqual(product.media, [
      {
        alt: 'Organic cotton crew tee',
        srcset_keys: { 320: 'p/x/abcdef0123456789-320.webp' },
        color: null,
      },
      {
        alt: 'Black tee, back',
        srcset_keys: { 640: 'p/x/abcdef0123456789-640.webp' },
        color: 'black',
      },
    ])
    assert.deepEqual(product.delivery, [
      {
        zone_code: 'ktm_valley',
        zone_name: 'Kathmandu Valley',
        fee: { amount_minor: 10000, currency: 'NPR' },
        est_min_days: 0,
        est_max_days: 1,
      },
      {
        zone_code: 'outside_valley',
        zone_name: 'Outside Kathmandu Valley',
        fee: { amount_minor: 15050, currency: 'NPR' },
        est_min_days: 2,
        est_max_days: 5,
      },
    ])
    assert.isString(product.published_at)
  })

  test('T-CAT-016 only what an active variant offers; a colour image keeps its fallback alt', async ({
    assert,
  }) => {
    const w = await world()
    const made = await publishedTee(w)
    // Black L archived: size L is then offered by no active variant.
    await db
      .from('product_variants')
      .where('id', made.variants.get('BL')!)
      .update({ status: 'archived' })
    await db
      .from('product_media')
      .where({ product_id: made.productId, position: 2 })
      .update({ alt_text: null })
    const response = await read(made.publicId)
    const product = response.body.data
    assert.lengthOf(product.variants, 2)
    assert.deepEqual(
      product.option_axes.map((axis: { values: { code: string }[] }) =>
        axis.values.map((value) => value.code)
      ),
      [['black', 'white'], ['m']]
    )
    assert.equal(product.media[1].alt, 'Organic cotton crew tee, Black')
    const brandId = await insertBrand('active')
    const brand = await db.from('brands').where('id', brandId).select('slug', 'name').firstOrFail()
    await db.from('products').where('id', made.productId).update({ brand_id: brandId })
    const branded = await read(made.publicId)
    assert.deepEqual(branded.body.data.brand, { slug: brand.slug, name: brand.name })
  })

  test('T-CAT-016 a product not on the storefront, or an unknown ID, is 404', async ({
    assert,
  }) => {
    const w = await world()
    const created = await create(w, await draftBody())
    const draftId = created.body.data.public_id as string
    assert.equal(await statusOf(draftId), 404, 'a draft')
    const made = await publishedTee(w)
    assert.equal(await statusOf(made.publicId), 200)
    await act(w, made.productId, 'unpublish')
    assert.equal(await statusOf(made.publicId), 404, 'unpublished')
    await act(w, made.productId, 'archive')
    assert.equal(await statusOf(made.publicId), 404, 'archived')
    assert.equal(await statusOf('ZZZZZZZZ'), 404, 'unknown')
    // A malformed ID matches no route, so it never reaches the API limits.
    const ip = randomIPv4()
    networks.push(clientNetwork(ip))
    for (const malformed of ['zzzzzzzz', 'ZZZZZZZZZ', 'ZZZZZZZI']) {
      const response = await getJson({ browser: testBrowser(), ip }, productUrl(malformed))
      assert.equal(response.status, 404, malformed)
    }
    const charged = await rateLimiter('catalog_ip').get(
      rateLimitKey('catalog_ip', clientNetwork(ip))
    )
    assert.isNull(charged)
  })

  test('T-CAT-016 a product without axes, imported, with a weight, of a shop without rates', async ({
    assert,
  }) => {
    const w = await world()
    await configureShipping(w)
    const watches = await db.from('categories').where('slug', 'analog-watches').firstOrFail()
    const created = await create(
      w,
      await draftBody({
        category_id: watches.id,
        attributes: [
          { attribute_code: 'audience', value_codes: ['men'] },
          { attribute_code: 'material', value_codes: ['nylon'] },
        ],
        is_imported: true,
        country_of_origin: 'IN',
        warranty_text: '1 year',
      })
    )
    if (created.status !== 201) throw new Error(`create: ${created.text}`)
    const productId = created.body.data.id as string
    const variants = await send(
      w.owner,
      'PUT',
      `${productPath(w.shop.slug, productId)}/variants`,
      {
        option_axes: [],
        variants: [
          {
            option_value_codes: {},
            sku: `WATCH-${randomUUID().slice(0, 6)}`,
            price_minor: 500000,
            weight_grams: 250,
          },
        ],
      },
      { 'If-Match': '"1"' }
    )
    if (variants.status !== 200) throw new Error(`variants: ${variants.text}`)
    const image = await readyAsset(w.shop.shopId, w.shop.ownerId, 320)
    const media = await send(
      w.owner,
      'PUT',
      `${productPath(w.shop.slug, productId)}/media`,
      { items: [{ media_asset_id: image, position: 1, alt_text: null }] },
      { 'If-Match': '"2"' }
    )
    if (media.status !== 200) throw new Error(`media: ${media.text}`)
    const published = await act(w, productId, 'publish')
    assert.equal(published.status, 200, published.text)
    // Rates removed on the row, a state the shipping operation itself does not leave a live shop in.
    await db.from('shop_shipping_rates').where('shop_id', w.shop.shopId).delete()
    // A variant without a stock row counts as sold out.
    await db.from('inventory_items').where('variant_id', variants.body.data.variants[0].id).delete()
    const response = await read(created.body.data.public_id)
    assert.equal(response.status, 200, response.text)
    const product = response.body.data
    assert.deepEqual(product.option_axes, [])
    assert.lengthOf(product.variants, 1)
    assert.deepEqual(product.variants[0].option_values, {})
    assert.equal(product.variants[0].weight_grams, 250)
    assert.include(product.variants[0], { in_stock: false, available_capped: 0 })
    assert.include(product.disclosures, { is_imported: true, country_of_origin: 'IN' })
    assert.deepEqual(product.delivery, [])
  })

  test('T-CAT-016 a product of a suspended shop is 404; a query parameter is 400', async ({
    assert,
  }) => {
    const w = await world()
    const made = await publishedTee(w)
    const withQuery = await read(made.publicId, '?fields=all')
    assert.equal(withQuery.status, 400)
    assert.equal(withQuery.body.code, 'INVALID_QUERY_PARAMETER')
    await setShopStatus(w.shop.shopId, 'suspended', 'fulfill_existing')
    const response = await read(made.publicId)
    assert.equal(response.status, 404)
    assert.equal(response.body.code, 'NOT_FOUND')
  })

  test('T-CAT-016 each call takes a catalog_ip point', async ({ assert }) => {
    const w = await world()
    const made = await publishedTee(w)
    const ip = randomIPv4()
    networks.push(clientNetwork(ip))
    const response = await getJson({ browser: testBrowser(), ip }, productUrl(made.publicId))
    assert.equal(response.status, 200, response.text)
    const charged = await rateLimiter('catalog_ip').get(
      rateLimitKey('catalog_ip', clientNetwork(ip))
    )
    assert.equal(charged?.consumed, 1)
  })
})

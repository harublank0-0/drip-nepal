import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { clientNetwork, rateLimiter, rateLimitKey } from '#modules/platform/rate_limits'
import { testBrowser } from '#tests/support/browser'
import { create, draftBody, insertBrand, productPath, world } from '#tests/support/catalog'
import { send } from '#tests/support/courier_http'
import {
  act,
  configureShipping,
  publishedTee,
  readyAsset,
} from '#tests/support/storefront_products'
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

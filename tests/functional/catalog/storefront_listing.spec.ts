import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { LISTING_PARAMETERS } from '#modules/catalog/domain/listing_query'
import { listingFilterAttributes } from '#modules/catalog/queries'
import { clientNetwork, rateLimiter, rateLimitKey } from '#modules/platform/rate_limits'
import { testBrowser } from '#tests/support/browser'
import { insertBrand } from '#tests/support/catalog'
import { forgetKeys, getJson, randomIPv4, type Guest } from '#tests/support/identity'
import { activeShop, listed, valueId } from '#tests/support/listings'

/*
 * The storefront listing over HTTP (docs/06 §6.1, §6.3, §13.2
 * `listProducts`, §14.1; ADR-0014; 01 AC-FR-SRCH-001-1 to -3,
 * AC-FR-SRCH-002-2, -3; R1-S part 3b). The rows are `product_listings` rows
 * written here directly, with exact prices, dates and value IDs, on products
 * made by the factory for the foreign key; T-CAT-012 tests how
 * `catalog.refresh_listing` builds them.
 *
 * - T-CAT-014: a card is exactly `ListingCard`; the category subtree, a
 *   navigation entry, attribute values (any of one attribute's values, all
 *   attributes), brand, shop, price range and stock filters; the sorts with
 *   `product_id` breaking ties; pages that never repeat or skip a card, with
 *   `meta`; a page past the last is empty; a category of no listing answers
 *   an empty page; every problem is one 400; each call takes a `catalog_ip`
 *   point.
 * - T-CAT-003: a typo finds the product by trigram word similarity when
 *   full-text search finds nothing; a Devanagari word is found by an exact
 *   query; a search matches the title, the brand, the category names and
 *   the shop name, ranked by relevance.
 */

const LISTING = '/api/v1/catalog/products'
const networks: string[] = []

async function forgetNetworks() {
  for (const network of networks.splice(0)) await forgetKeys('catalog_ip', network)
}

function visitor(): Guest {
  const ip = randomIPv4()
  networks.push(clientNetwork(ip))
  return { browser: testBrowser(), ip }
}

const list = (query = '') => getJson(visitor(), `${LISTING}${query}`)
const titles = (body: { data: { title: string }[] }) => body.data.map((card) => card.title)

test.group('T-CAT-014 the storefront listing', (group) => {
  group.each.teardown(forgetNetworks)

  test('T-CAT-014 a card is exactly ListingCard, with meta', async ({ assert }) => {
    const shop = await activeShop()
    const brandId = await insertBrand('active')
    const brand = await db.from('brands').where('id', brandId).select('name', 'slug').firstOrFail()
    const card = await listed(shop, {
      title: 'Organic cotton crew tee',
      brand: { id: brandId, name: brand.name, slug: brand.slug },
      min: 129900,
      max: 139900,
      compareAt: 159900,
      publishedAt: '2026-10-01T04:10:00Z',
    })
    const response = await list()
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body, {
      data: [
        {
          public_id: card.publicId,
          slug: card.slug,
          title: 'Organic cotton crew tee',
          shop: { slug: shop.slug, name: shop.name },
          brand: { slug: brand.slug, name: brand.name },
          price_min: { amount_minor: 129900, currency: 'NPR' },
          price_max: { amount_minor: 139900, currency: 'NPR' },
          compare_at: { amount_minor: 159900, currency: 'NPR' },
          in_stock: true,
          image: {
            alt: 'Organic cotton crew tee, front',
            srcset_keys: { 320: `p/${card.productId}/abc-320.webp` },
          },
          published_at: '2026-10-01T04:10:00.000Z',
        },
      ],
      meta: { page: 1, per_page: 24, total: 1, total_is_capped: false, has_more: false },
    })
    const ownLabel = await listed(shop, { title: 'Own label tee', compareAt: null })
    const both = await list('?sort=price_asc')
    const own = both.body.data.find((item: { slug: string }) => item.slug === ownLabel.slug)
    assert.isNull(own.brand)
    assert.isNull(own.compare_at)
  })

  test('T-CAT-014 the category subtree, a navigation entry, and an unlisted category', async ({
    assert,
  }) => {
    const shop = await activeShop()
    const men = await valueId('audience', 'men')
    const women = await valueId('audience', 'women')
    await listed(shop, { title: 'Men tee', category: 't-shirts', audience: [men] })
    await listed(shop, { title: 'Women tee', category: 't-shirts', audience: [women] })
    await listed(shop, { title: 'Men jeans', category: 'jeans', audience: [men] })
    await listed(shop, { title: 'Men sneakers', category: 'sneakers', audience: [men] })
    const sorted = (body: { data: { title: string }[] }) => titles(body).sort()
    const tops = await list('?category=tops')
    assert.deepEqual(sorted(tops.body), ['Men tee', 'Women tee'])
    const clothing = await list('?category=clothing')
    assert.deepEqual(sorted(clothing.body), ['Men jeans', 'Men tee', 'Women tee'])
    const nav = await list('?nav=men/t-shirts')
    assert.deepEqual(titles(nav.body), ['Men tee'])
    const menPage = await list('?nav=men')
    assert.deepEqual(sorted(menPage.body), ['Men jeans', 'Men sneakers', 'Men tee'])
    const unknown = await list('?category=no-such-category')
    assert.equal(unknown.status, 200)
    assert.deepEqual(unknown.body, {
      data: [],
      meta: { page: 1, per_page: 24, total: 0, total_is_capped: false, has_more: false },
    })
  })

  test('T-CAT-014 attribute values, brand, shop, price range and stock filters', async ({
    assert,
  }) => {
    const shop = await activeShop()
    const other = await activeShop()
    const [men, women, m, l, black] = await Promise.all([
      valueId('audience', 'men'),
      valueId('audience', 'women'),
      valueId('apparel_size', 'm'),
      valueId('apparel_size', 'l'),
      valueId('color', 'black'),
    ])
    const brandId = await insertBrand('active')
    const brand = await db.from('brands').where('id', brandId).select('name', 'slug').firstOrFail()
    await listed(shop, {
      title: 'Black M tee',
      audience: [men],
      sizes: [m],
      colors: [black],
      min: 100000,
      max: 150000,
    })
    await listed(shop, { title: 'L tee', audience: [women], sizes: [l], min: 200000 })
    await listed(shop, {
      title: 'Branded tee',
      audience: [men, women],
      brand: { id: brandId, name: brand.name, slug: brand.slug },
      min: 300000,
      inStock: false,
    })
    await listed(other, { title: 'Other shop tee', min: 120000 })
    const sorted = (query: string) => list(query).then((response) => titles(response.body).sort())
    assert.deepEqual(await sorted('?audience=women'), ['Branded tee', 'L tee'])
    assert.deepEqual(await sorted('?audience=men&audience=women'), [
      'Black M tee',
      'Branded tee',
      'L tee',
    ])
    assert.deepEqual(await sorted('?apparel_size=m&apparel_size=l'), ['Black M tee', 'L tee'])
    assert.deepEqual(await sorted('?audience=men&apparel_size=l'), [])
    assert.deepEqual(await sorted('?color=black&audience=men'), ['Black M tee'])
    assert.deepEqual(await sorted(`?brand=${brand.slug}`), ['Branded tee'])
    assert.deepEqual(await sorted(`?shop=${other.slug}`), ['Other shop tee'])
    // A product matches when one of its prices lies in the range.
    assert.deepEqual(await sorted('?price_min_minor=140000&price_max_minor=250000'), [
      'Black M tee',
      'L tee',
    ])
    assert.deepEqual(await sorted('?price_max_minor=110000'), ['Black M tee'])
    assert.deepEqual(await sorted('?price_min_minor=250000'), ['Branded tee'])
    assert.deepEqual(await sorted('?in_stock=true'), ['Black M tee', 'L tee', 'Other shop tee'])
    const noShop = await list('?shop=no-such-shop')
    assert.deepEqual(noShop.body.data, [])
  })

  test('T-CAT-014 the sorts, with product_id breaking ties', async ({ assert }) => {
    const shop = await activeShop()
    await listed(shop, {
      title: 'Tee A',
      min: 200000,
      publishedAt: '2026-11-03T00:00:00Z',
    })
    const b = await listed(shop, {
      title: 'Tee B',
      min: 100000,
      publishedAt: '2026-11-01T00:00:00Z',
    })
    await listed(shop, {
      title: 'Tee C',
      min: 300000,
      publishedAt: '2026-11-02T00:00:00Z',
    })
    // Same date and price as B: the product ID decides.
    const d = await listed(shop, {
      title: 'Tee D',
      min: 100000,
      publishedAt: '2026-11-01T00:00:00Z',
    })
    const [first, second] = [b, d].sort((x, y) => (x.productId < y.productId ? -1 : 1))
    const newest = await list()
    assert.deepEqual(titles(newest.body), ['Tee A', 'Tee C', first.title, second.title])
    const cheap = await list('?sort=price_asc')
    assert.deepEqual(titles(cheap.body), [first.title, second.title, 'Tee A', 'Tee C'])
    const dear = await list('?sort=price_desc')
    assert.deepEqual(titles(dear.body), ['Tee C', 'Tee A', first.title, second.title])
  })

  test('T-CAT-014 pages never repeat or skip a card; past the last is empty', async ({
    assert,
  }) => {
    const shop = await activeShop()
    for (let i = 0; i < 5; i++) {
      await listed(shop, { title: `Tee ${i}`, publishedAt: '2026-11-01T00:00:00Z' })
    }
    const seen: string[] = []
    for (const page of [1, 2, 3]) {
      const response = await list(`?per_page=2&page=${page}`)
      assert.equal(response.status, 200, response.text)
      seen.push(...titles(response.body))
      assert.deepEqual(response.body.meta, {
        page,
        per_page: 2,
        total: 5,
        total_is_capped: false,
        has_more: page < 3,
      })
    }
    assert.sameMembers(seen, ['Tee 0', 'Tee 1', 'Tee 2', 'Tee 3', 'Tee 4'])
    assert.lengthOf(seen, 5)
    // A page that holds exactly per_page cards and no more has nothing after it.
    const whole = await list('?per_page=5')
    assert.lengthOf(whole.body.data, 5)
    assert.isFalse(whole.body.meta.has_more)
    const past = await list('?per_page=2&page=4')
    assert.equal(past.status, 200)
    assert.deepEqual(past.body.data, [])
    assert.equal(past.body.meta.total, 5)
  })

  test('T-CAT-014 every problem is one 400 naming each parameter', async ({ assert }) => {
    const response = await list('?colour=black&sort=popular&page=0')
    assert.equal(response.status, 400, response.text)
    assert.equal(response.body.code, 'INVALID_QUERY_PARAMETER')
    assert.sameMembers(
      response.body.errors.map((item: { field: string }) => item.field),
      ['colour', 'sort', 'page']
    )
    for (const query of [
      '?sort=relevance',
      '?nav=men/unknown',
      '?nav=men&category=jeans',
      '?audience=nobody',
      '?per_page=49',
      '?q=x',
      '?in_stock=false',
      '?price_min_minor=3&price_max_minor=2',
      '?category=tops&category=jeans',
      '?q=ab%00',
      '?page=01',
      '?a[b]=1',
      '?page[]=1',
    ]) {
      const refused = await list(query)
      assert.equal(refused.status, 400, query)
    }
  })

  test('T-CAT-014 bracket forms of a filter are read as repeats', async ({ assert }) => {
    const shop = await activeShop()
    const men = await valueId('audience', 'men')
    await listed(shop, { title: 'Men tee', audience: [men] })
    const response = await list('?audience[]=men')
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(titles(response.body), ['Men tee'])
  })

  test('T-CAT-014 the filterable attributes and their listing arrays', async ({ assert }) => {
    // Pinned to the seeded attributes: a new filterable attribute must be mapped here on purpose.
    const attributes = await listingFilterAttributes()
    assert.deepEqual(
      Object.fromEntries([...attributes].map(([code, attribute]) => [code, attribute.column])),
      {
        audience: 'audience_value_ids',
        apparel_size: 'size_value_ids',
        shoe_size_eu: 'size_value_ids',
        waist_size_in: 'size_value_ids',
        color: 'color_value_ids',
      }
    )
    // No attribute code shadows a fixed parameter.
    for (const code of attributes.keys()) {
      assert.notInclude(LISTING_PARAMETERS as readonly string[], code)
    }
  })

  test('T-CAT-014 each call takes a catalog_ip point', async ({ assert }) => {
    const ip = randomIPv4()
    networks.push(clientNetwork(ip))
    const response = await getJson({ browser: testBrowser(), ip }, LISTING)
    assert.equal(response.status, 200, response.text)
    const charged = await rateLimiter('catalog_ip').get(
      rateLimitKey('catalog_ip', clientNetwork(ip))
    )
    assert.equal(charged?.consumed, 1)
  })
})

test.group('T-CAT-003 keyword search', (group) => {
  group.each.teardown(forgetNetworks)

  test('T-CAT-003 a typo finds the product by trigram word similarity', async ({ assert }) => {
    const shop = await activeShop()
    await listed(shop, { title: 'Classic white sneakers' })
    await listed(shop, { title: 'Organic cotton crew tee' })
    const exact = await list('?q=sneakers')
    assert.deepEqual(titles(exact.body), ['Classic white sneakers'])
    const typo = await list('?q=snekers')
    assert.equal(typo.status, 200, typo.text)
    assert.deepEqual(titles(typo.body), ['Classic white sneakers'])
    assert.equal(typo.body.meta.total, 1)
    const nothing = await list('?q=zzzzqqq')
    assert.deepEqual(nothing.body.data, [])
    const punctuation = await list('?q=!!')
    assert.equal(punctuation.status, 200, punctuation.text)
    assert.deepEqual(punctuation.body.data, [])
  })

  test('T-CAT-003 the fallback keeps the other filters and the chosen sort', async ({ assert }) => {
    const shop = await activeShop()
    await listed(shop, {
      title: 'Old sneakers',
      category: 'sneakers',
      publishedAt: '2026-10-01T00:00:00Z',
    })
    await listed(shop, {
      title: 'New sneakers',
      category: 'sneakers',
      publishedAt: '2026-11-01T00:00:00Z',
    })
    const newest = await list('?q=snekers&sort=newest')
    assert.deepEqual(titles(newest.body), ['New sneakers', 'Old sneakers'])
    // The typo's only matches are footwear, so a clothing listing stays empty.
    const clothing = await list('?q=snekers&category=clothing')
    assert.equal(clothing.status, 200, clothing.text)
    assert.deepEqual(clothing.body.data, [])
  })

  test('T-CAT-003 a Devanagari word is found by an exact query', async ({ assert }) => {
    const shop = await activeShop()
    await listed(shop, { title: 'ढाका टोपी classic' })
    await listed(shop, { title: 'Plain cap' })
    const response = await list(`?q=${encodeURIComponent('टोपी')}`)
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(titles(response.body), ['ढाका टोपी classic'])
    // In a brand name, which the title fallback never reads: only full-text search finds it.
    const [brand] = await db
      .table('brands')
      .insert({ slug: `test-dhaka-${Date.now()}`, name: 'ढाका कपडा', status: 'active' })
      .returning(['id', 'name', 'slug'])
    await listed(shop, { title: 'Woven shawl', brand })
    const byBrand = await list(`?q=${encodeURIComponent('कपडा')}`)
    assert.deepEqual(titles(byBrand.body), ['Woven shawl'])
  })

  test('T-CAT-003 a search matches title, brand, category and shop names, by relevance', async ({
    assert,
  }) => {
    const shop = await activeShop()
    const brandId = await insertBrand('active')
    const brand = await db.from('brands').where('id', brandId).select('name', 'slug').firstOrFail()
    await listed(shop, { title: 'Everyday hoodie' })
    await listed(shop, {
      title: 'Logo tee',
      brand: { id: brandId, name: brand.name, slug: brand.slug },
    })
    const byBrand = await list(`?q=${encodeURIComponent(brand.name)}`)
    assert.deepEqual(titles(byBrand.body), ['Logo tee'])
    // The title weighs A, the category names C: a title match ranks first.
    await listed(shop, { title: 'Tops sampler', category: 'jeans' })
    const tops = await list('?q=tops')
    assert.equal(titles(tops.body)[0], 'Tops sampler')
    assert.includeMembers(titles(tops.body), ['Everyday hoodie', 'Logo tee'])
    const byShop = await list(`?q=${encodeURIComponent(shop.name)}`)
    assert.lengthOf(byShop.body.data, 3)
  })
})

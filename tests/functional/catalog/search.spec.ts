import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { HttpContextFactory } from '@adonisjs/core/factories/http'
import app from '@adonisjs/core/services/app'
import Attribute from '#models/attribute'
import AttributeValue from '#models/attribute_value'
import Category from '#models/category'
import type Shop from '#models/shop'
import CatalogController from '#modules/catalog/controllers/catalog_controller'
import CatalogService from '#modules/catalog/services/catalog_service'
import type ProductCardTransformer from '#transformers/product_card_transformer'
import { createShop, createVariant } from '#tests/support/fixtures'

type ListingProps = {
  context: { query: string }
  products: ReturnType<typeof ProductCardTransformer.paginate>
  facets: Awaited<ReturnType<CatalogService['facets']>>
  filters: {
    category: string | null
    sizes: string[]
    colors: string[]
    min: number | null
    max: number | null
    sort: string
  }
}

/*
 * Exercise the page controller's URL parsing and real PostgreSQL queries.
 * Only the Inertia rendering boundary is replaced: API-client coverage is
 * not available in the v1 test harness (docs/10 Consistency note 29).
 */
async function search(query: Record<string, string>) {
  const ctx = new HttpContextFactory()
    .merge({ url: `/search?${new URLSearchParams(query)}` })
    .create()
  let props: ListingProps | undefined
  Object.defineProperty(ctx, 'inertia', {
    value: {
      render(_page: string, data: ListingProps) {
        props = data
      },
    },
  })

  await new CatalogController(new CatalogService()).search(ctx)
  if (!props) throw new Error('Search did not render listing props')

  const products = await props.products.resolve(app.container.createResolver(), 0)
  return { ...props, products }
}

async function product(
  shop: Shop,
  name: string,
  category: Category,
  // Whole rupees, like the listing's price filter.
  { rupees = 1800, size = 'm', color = 'black' } = {}
) {
  const variant = await createVariant(shop, {
    priceMinor: rupees * 100,
    product: { name, categoryId: category.id },
  })
  const sizeAttribute = await Attribute.findByOrFail('slug', 'size')
  const colorAttribute = await Attribute.findByOrFail('slug', 'color')
  const values = await Promise.all([
    AttributeValue.firstOrCreate(
      { attributeId: sizeAttribute.id, slug: size },
      { value: size.toUpperCase() }
    ),
    AttributeValue.firstOrCreate({ attributeId: colorAttribute.id, slug: color }, { value: color }),
  ])
  await variant.related('attributeValues').attach(values.map((value) => value.id))
  return variant.productId
}

test.group('Search category refinements [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('T-CAT-110 category combines with query, options, price and sort without hiding other categories', async ({
    assert,
  }) => {
    const shop = await createShop()
    const cargo = await Category.findByOrFail('slug', 'cargo-pants')
    const hoodies = await Category.findByOrFail('slug', 'hoodies')
    const q = `discovery-${randomUUID()}`
    const cheaper = await product(shop, `${q} utility`, cargo)
    const dearer = await product(shop, `${q} relaxed`, cargo, { rupees: 2400 })
    const hoodie = await product(shop, `${q} layer`, hoodies)
    await product(shop, 'Unrelated utility pants', cargo)
    await product(shop, `${q} large`, cargo, { size: 'l' })
    await product(shop, `${q} white`, cargo, { color: 'white' })
    await product(shop, `${q} budget`, cargo, { rupees: 900 })
    await product(shop, `${q} premium`, cargo, { rupees: 3200 })

    const query = {
      q,
      category: 'cargo-pants',
      size: 'm',
      color: 'black',
      min: '1000',
      max: '3000',
      sort: 'price_desc',
    }
    const result = await search(query)

    assert.deepEqual(
      result.products.data.map((item) => item.id),
      [dearer, cheaper]
    )
    assert.equal(result.context.query, q)
    assert.deepEqual(result.filters, {
      category: 'cargo-pants',
      sizes: ['m'],
      colors: ['black'],
      min: 1000,
      max: 3000,
      sort: 'price_desc',
    })
    assert.sameMembers(
      result.facets.categories.map((category) => category.slug),
      ['cargo-pants', 'hoodies']
    )

    const switched = await search({ ...query, category: 'hoodies' })
    assert.deepEqual(
      switched.products.data.map((item) => item.id),
      [hoodie]
    )
    assert.equal(switched.filters.category, 'hoodies')
    assert.sameMembers(
      switched.facets.categories.map((category) => category.slug),
      ['cargo-pants', 'hoodies']
    )
  })

  test('T-CAT-110 empty category results keep the query facets available for recovery', async ({
    assert,
  }) => {
    const shop = await createShop()
    const cargo = await Category.findByOrFail('slug', 'cargo-pants')
    const q = `discovery-${randomUUID()}`
    await product(shop, q, cargo)

    const result = await search({ q, category: 'hoodies' })

    assert.isEmpty(result.products.data)
    assert.equal(result.filters.category, 'hoodies')
    assert.deepEqual(
      result.facets.categories.map((category) => category.slug),
      ['cargo-pants']
    )
  })

  test('T-CAT-110 category works without a query and can be cleared back to all products', async ({
    assert,
  }) => {
    const shop = await createShop()
    const cargo = await Category.findByOrFail('slug', 'cargo-pants')
    const hoodies = await Category.findByOrFail('slug', 'hoodies')
    const cargoId = await product(shop, 'Utility pants', cargo)
    const hoodieId = await product(shop, 'Everyday hoodie', hoodies)

    // Without a query the search covers the whole catalog, so assert on this
    // test's products: the reference seeds hold no products, but a seeded
    // product or a shared fixture must not break this test.
    const narrowed = await search({ category: 'cargo-pants' })
    const narrowedIds = narrowed.products.data.map((item) => item.id)
    assert.include(narrowedIds, cargoId)
    assert.notInclude(narrowedIds, hoodieId)
    assert.equal(narrowed.context.query, '')

    const all = await search({})
    assert.includeMembers(
      all.products.data.map((item) => item.id),
      [cargoId, hoodieId]
    )
    assert.isNull(all.filters.category)
    assert.equal(all.context.query, '')
  })
})

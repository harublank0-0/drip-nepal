import { test } from '@japa/runner'
import {
  cappedTotal,
  parseListingQuery,
  type FilterableAttribute,
} from '#modules/catalog/domain/listing_query'

/*
 * T-CAT-014: the storefront listing's query read into filters, or every
 * problem with it (docs/06 §6.1, §6.3 `listProducts`; 01 AC-FR-SRCH-001-1 to
 * -3; R1-S part 3b), and the capped total.
 */
const FILTERABLE = new Map<string, FilterableAttribute>([
  [
    'audience',
    {
      column: 'audience_value_ids',
      values: new Map([
        ['men', 'a-men'],
        ['women', 'a-women'],
      ]),
    },
  ],
  [
    'apparel_size',
    {
      column: 'size_value_ids',
      values: new Map([
        ['m', 's-m'],
        ['l', 's-l'],
      ]),
    },
  ],
  ['color', { column: 'color_value_ids', values: new Map([['black', 'c-black']]) }],
])

const parse = (query: Record<string, unknown>) => parseListingQuery(query, FILTERABLE)
const parameters = (query: Record<string, unknown>) =>
  parse(query).problems.map((problem) => problem.parameter)

test.group('T-CAT-014 the listing query', () => {
  test('T-CAT-014 no parameter gives the defaults', ({ assert }) => {
    assert.deepEqual(parse({}), {
      filters: {
        categorySlug: null,
        valueFilters: [],
        brandSlugs: [],
        shopSlug: null,
        priceMinMinor: null,
        priceMaxMinor: null,
        inStock: false,
        q: null,
        sort: 'newest',
        page: 1,
        perPage: 24,
      },
      problems: [],
    })
  })

  test('T-CAT-014 every filter is read', ({ assert }) => {
    const { filters } = parse({
      category: 't-shirts',
      audience: ['men', 'women'],
      apparel_size: 'm',
      color: 'black',
      brand: ['nike', 'puma', 'nike'],
      shop: 'kathmandu-threads',
      price_min_minor: '100000',
      price_max_minor: '200000',
      in_stock: 'true',
      q: '  crew tee  ',
      sort: 'price_asc',
      page: '3',
      per_page: '48',
    })
    assert.deepEqual(filters, {
      categorySlug: 't-shirts',
      valueFilters: [
        { column: 'audience_value_ids', ids: ['a-men', 'a-women'] },
        { column: 'size_value_ids', ids: ['s-m'] },
        { column: 'color_value_ids', ids: ['c-black'] },
      ],
      brandSlugs: ['nike', 'puma'],
      shopSlug: 'kathmandu-threads',
      priceMinMinor: 100000,
      priceMaxMinor: 200000,
      inStock: true,
      q: 'crew tee',
      sort: 'price_asc',
      page: 3,
      perPage: 48,
    })
  })

  test('T-CAT-014 a navigation entry sets the audience and the category', ({ assert }) => {
    const { filters } = parse({ nav: 'men/t-shirts' })
    assert.equal(filters?.categorySlug, 't-shirts')
    assert.deepEqual(filters?.valueFilters, [{ column: 'audience_value_ids', ids: ['a-men'] }])
    const audiencePage = parse({ nav: 'women' })
    assert.isNull(audiencePage.filters?.categorySlug)
    assert.deepEqual(audiencePage.filters?.valueFilters, [
      { column: 'audience_value_ids', ids: ['a-women'] },
    ])
  })

  test('T-CAT-014 a search sorts by relevance unless told otherwise', ({ assert }) => {
    assert.equal(parse({ q: 'tee' }).filters?.sort, 'relevance')
    assert.equal(parse({ q: 'tee', sort: 'newest' }).filters?.sort, 'newest')
  })

  test('T-CAT-014 every problem is named', ({ assert }) => {
    const cases: [Record<string, unknown>, string[]][] = [
      [{ colour: 'black' }, ['colour']],
      [{ sort: 'popular' }, ['sort']],
      [{ sort: 'relevance' }, ['sort']],
      [{ q: 'x' }, ['q']],
      [{ q: 'x'.repeat(101) }, ['q']],
      [{ page: '0' }, ['page']],
      [{ page: '101' }, ['page']],
      [{ per_page: '49' }, ['per_page']],
      [{ page: '1.5' }, ['page']],
      [{ page: ['1', '2'] }, ['page']],
      [{ category: 'T-Shirts' }, ['category']],
      [{ nav: 'men/unknown' }, ['nav']],
      [{ nav: 'men/t-shirts', category: 'jeans' }, ['nav']],
      [{ nav: 'men', audience: 'women' }, ['nav']],
      [{ audience: 'kids' }, ['audience']],
      [{ apparel_size: Array.from({ length: 21 }, (_, i) => `v${i}`) }, ['apparel_size']],
      [{ brand: 'Nike!' }, ['brand']],
      [{ shop: 'a' }, ['shop']],
      [{ price_min_minor: '-1' }, ['price_min_minor']],
      [{ price_max_minor: '1e5' }, ['price_max_minor']],
      [{ price_min_minor: '300', price_max_minor: '200' }, ['price_min_minor']],
      [{ in_stock: 'false' }, ['in_stock']],
      [{ colour: 'x', page: '0', q: 'x' }, ['colour', 'q', 'page']],
    ]
    for (const [query, expected] of cases) {
      const result = parse(query)
      assert.isNull(result.filters, JSON.stringify(query))
      assert.sameMembers(parameters(query), expected, JSON.stringify(query))
    }
  })

  test('T-CAT-014 the total is capped at 10,000', ({ assert }) => {
    assert.deepEqual(cappedTotal(0), { total: 0, totalIsCapped: false })
    assert.deepEqual(cappedTotal(10_000), { total: 10_000, totalIsCapped: false })
    assert.deepEqual(cappedTotal(10_001), { total: 10_000, totalIsCapped: true })
  })
})

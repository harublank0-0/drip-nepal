import { test } from '@japa/runner'
import {
  clearRefinements,
  EMPTY_LISTING_STATE,
  hasRefinements,
  listingUrl,
  searchedTerm,
  stateSort,
  toggleBrand,
  toggleValue,
  withQuery,
  type ListingUrlState,
} from '#shared/ui/listing_url'

/*
 * T-UI-047 (the unit part): what the listing's filter controls change
 * (docs/08 §11.1; R1-S part 3d-i-b). A value or brand ticked joins the
 * sorted list and unticked leaves it; "Clear all" removes every refinement
 * and keeps the search, the sort and the page size; a new search keeps the
 * refinements and takes an explicit relevance sort with it when cleared;
 * a sort equal to the search's default is held as the default.
 */
const state = (patch: Partial<ListingUrlState>): ListingUrlState => ({
  ...EMPTY_LISTING_STATE,
  ...patch,
})

test.group('T-UI-047 the filter changes', () => {
  test('T-UI-047 ticking and unticking a value or a brand', ({ assert }) => {
    const ticked = toggleValue(
      state({ values: { apparel_size: ['m'] } }),
      'apparel_size',
      'l',
      true
    )
    assert.deepEqual(ticked.values.apparel_size, ['l', 'm'])
    assert.deepEqual(toggleValue(ticked, 'apparel_size', 'm', false).values.apparel_size, ['l'])
    assert.deepEqual(toggleValue(ticked, 'color', 'black', true).values, {
      apparel_size: ['l', 'm'],
      color: ['black'],
    })
    // Ticking twice keeps one.
    assert.deepEqual(toggleValue(ticked, 'apparel_size', 'l', true).values.apparel_size, ['l', 'm'])
    const brands = toggleBrand(state({ brand: ['puma'] }), 'nike', true)
    assert.deepEqual(brands.brand, ['nike', 'puma'])
    assert.deepEqual(toggleBrand(brands, 'puma', false).brand, ['nike'])
  })

  test('T-UI-047 clear all keeps the search, the sort and the page size', ({ assert }) => {
    const refined = state({
      q: 'tee',
      category: 'footwear',
      values: { color: ['black'] },
      brand: ['nike'],
      shop: 'kathmandu-threads',
      priceMinMinor: 100000,
      priceMaxMinor: 200000,
      inStock: true,
      sort: 'price_asc',
      page: 3,
      perPage: 48,
    })
    assert.isTrue(hasRefinements(refined))
    const cleared = clearRefinements(refined)
    assert.deepEqual(cleared, state({ q: 'tee', sort: 'price_asc', perPage: 48 }))
    assert.isFalse(hasRefinements(cleared))
    for (const patch of [
      { category: 'footwear' },
      { values: { color: ['black'] } },
      { brand: ['nike'] },
      { shop: 'kathmandu-threads' },
      { priceMinMinor: 1 },
      { priceMaxMinor: 1 },
      { inStock: true },
    ]) {
      assert.isTrue(hasRefinements(state(patch)), JSON.stringify(patch))
    }
    assert.isFalse(hasRefinements(state({ q: 'tee', sort: 'price_desc', perPage: 48, page: 2 })))
    assert.isFalse(hasRefinements(state({ values: { color: [] } })))
  })

  test('T-UI-047 a new search keeps the refinements; relevance needs a search', ({ assert }) => {
    const refined = state({ q: 'tee', values: { color: ['black'] }, sort: 'price_asc' })
    assert.deepEqual(withQuery(refined, 'shirt'), { ...refined, q: 'shirt' })
    assert.equal(
      listingUrl('/search', withQuery(refined, null)),
      '/search?color=black&sort=price_asc'
    )
    const relevance = state({ q: 'tee', sort: 'relevance' })
    assert.isNull(withQuery(relevance, null).sort)
    assert.equal(withQuery(relevance, 'shirt').sort, 'relevance')
    // The default follows the search: newest without one, relevance with one.
    assert.equal(listingUrl('/search', withQuery(state({}), 'tee')), '/search?q=tee')
  })

  test('T-UI-047 a sort equal to the default is held as the default', ({ assert }) => {
    assert.isNull(stateSort('newest', null))
    assert.isNull(stateSort('relevance', 'tee'))
    assert.isNull(stateSort(null, 'tee'))
    assert.equal(stateSort('newest', 'tee'), 'newest')
    assert.equal(stateSort('price_asc', null), 'price_asc')
  })

  test('T-UI-047 the search term as the server reads it', ({ assert }) => {
    assert.equal(searchedTerm('  -te '), 'te')
    assert.equal(searchedTerm('t-shirt -red'), 't-shirt red')
    assert.equal(searchedTerm('कु-र्ता'), 'कु-र्ता')
    assert.equal(searchedTerm('--'), '')
  })
})

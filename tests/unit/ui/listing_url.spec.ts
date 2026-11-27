import { test } from '@japa/runner'
import {
  EMPTY_LISTING_STATE,
  isUnrefined,
  listingUrl,
  type ListingUrlState,
} from '#shared/ui/listing_url'

/*
 * T-UI-014 (the unit part): one listing URL per filter set (docs/08 §11.1
 * "Canonical order"): the same filters in any click order give one string,
 * and defaults are left out; and what counts as an unrefined listing.
 */
const state = (patch: Partial<ListingUrlState>): ListingUrlState => ({
  ...EMPTY_LISTING_STATE,
  ...patch,
})

test.group('T-UI-014 the listing URL', () => {
  test('T-UI-014 the same filters in any order give one URL, in canonical order', ({ assert }) => {
    const one = listingUrl(
      '/men',
      state({
        values: { color: ['white', 'black'], apparel_size: ['m', 'l'] },
        brand: ['puma', 'nike'],
        priceMaxMinor: 200000,
        inStock: true,
        sort: 'price_asc',
        page: 2,
      })
    )
    const two = listingUrl(
      '/men',
      state({
        page: 2,
        sort: 'price_asc',
        inStock: true,
        priceMaxMinor: 200000,
        brand: ['nike', 'puma'],
        values: { apparel_size: ['l', 'm'], color: ['black', 'white'] },
      })
    )
    assert.equal(one, two)
    assert.equal(
      one,
      '/men?apparel_size=l&apparel_size=m&color=black&color=white&brand=nike&brand=puma&price_max_minor=200000&in_stock=true&sort=price_asc&page=2'
    )
  })

  test('T-UI-014 defaults are left out; q and category lead', ({ assert }) => {
    assert.equal(listingUrl('/men', EMPTY_LISTING_STATE), '/men')
    assert.equal(listingUrl('/men', state({ sort: 'newest', page: 1, perPage: 24 })), '/men')
    assert.equal(
      listingUrl('/search', state({ q: 'tee', category: 'tops', sort: 'relevance' })),
      '/search?q=tee&category=tops'
    )
    assert.equal(
      listingUrl('/search', state({ q: 'tee', sort: 'newest' })),
      '/search?q=tee&sort=newest'
    )
    assert.equal(listingUrl('/men', state({ perPage: 12 })), '/men?per_page=12')
  })

  test('T-UI-014 an unrefined listing has no filter, the default sort and page size', ({
    assert,
  }) => {
    assert.isTrue(isUnrefined(state({ page: 3 })))
    assert.isTrue(isUnrefined(state({ q: 'tee', category: 'tops', sort: 'relevance' })))
    assert.isFalse(isUnrefined(state({ values: { color: ['black'] } })))
    assert.isFalse(isUnrefined(state({ sort: 'price_asc' })))
    assert.isFalse(isUnrefined(state({ perPage: 48 })))
    assert.isFalse(isUnrefined(state({ inStock: true })))
  })
})

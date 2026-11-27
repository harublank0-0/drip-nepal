/*
 * One URL per filter set on the storefront listing pages (docs/08 §11.1
 * "Canonical order", AC-FR-SRCH-001-4; R1-S part 3d-i). The server builds
 * the target of its canonical redirect with it, and the filter controls
 * build their visits with it, so the same filters always give the same
 * string. Parameters come in this order, defaults left out:
 *
 * 1. `q`; 2. `category` (only on `/search`, where the path has none);
 * 3. the attribute filters, `audience`, `apparel_size`, `shoe_size_eu`,
 *    `waist_size_in`, `color`, then any other by code, each value repeated
 *    and sorted; 4. `brand` (repeated, sorted), then `shop`; 5. the price
 *    range in paisa; 6. `in_stock=true`; 7. `sort`, unless it is the default
 *    (`relevance` with a search, else `newest`); 8. `page` unless 1,
 *    `per_page` unless 24.
 */
export const LISTING_VALUE_ORDER = [
  'audience',
  'apparel_size',
  'shoe_size_eu',
  'waist_size_in',
  'color',
] as const

export const LISTING_DEFAULT_PER_PAGE = 24

export type ListingUrlState = {
  q: string | null
  category: string | null
  // Attribute code → value codes.
  values: Readonly<Record<string, readonly string[]>>
  brand: readonly string[]
  shop: string | null
  priceMinMinor: number | null
  priceMaxMinor: number | null
  inStock: boolean
  // Null for the default sort.
  sort: string | null
  page: number
  perPage: number
}

export const EMPTY_LISTING_STATE: ListingUrlState = {
  q: null,
  category: null,
  values: {},
  brand: [],
  shop: null,
  priceMinMinor: null,
  priceMaxMinor: null,
  inStock: false,
  sort: null,
  page: 1,
  perPage: LISTING_DEFAULT_PER_PAGE,
}

const sorted = (values: readonly string[]) => [...new Set(values)].sort()

// The default sort of a listing: relevance for a search, newest otherwise.
export function defaultSort(q: string | null) {
  return q === null ? 'newest' : 'relevance'
}

export function listingUrl(path: string, state: ListingUrlState): string {
  const params = new URLSearchParams()
  if (state.q !== null) params.set('q', state.q)
  if (state.category !== null) params.set('category', state.category)
  const known = new Set<string>(LISTING_VALUE_ORDER)
  const codes = [
    ...LISTING_VALUE_ORDER,
    ...Object.keys(state.values)
      .filter((code) => !known.has(code))
      .sort(),
  ]
  for (const code of codes) {
    for (const value of sorted(state.values[code] ?? [])) params.append(code, value)
  }
  for (const brand of sorted(state.brand)) params.append('brand', brand)
  if (state.shop !== null) params.set('shop', state.shop)
  if (state.priceMinMinor !== null) params.set('price_min_minor', String(state.priceMinMinor))
  if (state.priceMaxMinor !== null) params.set('price_max_minor', String(state.priceMaxMinor))
  if (state.inStock) params.set('in_stock', 'true')
  if (state.sort !== null && state.sort !== defaultSort(state.q)) params.set('sort', state.sort)
  if (state.page > 1) params.set('page', String(state.page))
  if (state.perPage !== LISTING_DEFAULT_PER_PAGE) params.set('per_page', String(state.perPage))
  const query = params.toString()
  return query === '' ? path : `${path}?${query}`
}

/*
 * Whether the listing shows no refinement of its own base: no filter, the
 * default sort and page size (docs/ADR-0017 decision 8). A search's `q`,
 * and a category on `/search`, are part of the base.
 */
export function isUnrefined(state: ListingUrlState) {
  return (
    Object.values(state.values).every((values) => values.length === 0) &&
    state.brand.length === 0 &&
    state.shop === null &&
    state.priceMinMinor === null &&
    state.priceMaxMinor === null &&
    !state.inStock &&
    (state.sort === null || state.sort === defaultSort(state.q)) &&
    state.perPage === LISTING_DEFAULT_PER_PAGE
  )
}

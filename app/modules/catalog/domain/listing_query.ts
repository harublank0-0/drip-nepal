import { navigationEntry } from '#modules/catalog/navigation'

/*
 * The storefront listing's query (docs/06 §6.1, §6.3 `listProducts`; 01
 * AC-FR-SRCH-001-1 to -3, AC-FR-SRCH-002-1; ADR-0014 decisions 3 and 4; R1-S
 * part 3b): the closed parameter list read into filters, or the problems
 * found. The API answers every problem with one 400
 * `INVALID_QUERY_PARAMETER`; the storefront pages (part 3d) drop the
 * parameters named and redirect to the canonical URL instead. Pure: the
 * caller passes the filterable attributes with their active values.
 *
 * - `category` (a slug; its subtree) and `nav` (a navigation entry path
 *   without its leading slash, such as `men/t-shirts`, which sets the
 *   audience and the category). `nav` cannot be combined with `category` or
 *   `audience`, which it fixes.
 * - One parameter per filterable attribute, named by its code, with value
 *   codes; repeated values match any of them, and attributes all apply.
 * - `brand` (slugs, any of them), `shop` (a slug), `price_min_minor` and
 *   `price_max_minor` (paisa; a product matches when its price range, from
 *   its lowest to its highest price, overlaps the range asked for),
 *   `in_stock` (`true` only), `q` (2 to 100 characters after a hyphen that
 *   does not join two letters or digits is dropped and the rest trimmed, so
 *   a search never becomes a pure exclusion; no control character).
 * - Numbers are written without leading zeros, so each query has one form
 *   the storefront pages can redirect to.
 * - Problems name each parameter once, at most 20 of them, and quote no
 *   value back.
 * - `sort`: `newest` (the default), `price_asc`, `price_desc`, or
 *   `relevance`, which needs `q` and is then the default. `page` 1 to 100,
 *   `per_page` 1 to 48 (default 24).
 * - A multi-value parameter takes at most 20 values; every other parameter
 *   is sent once.
 */

export const LISTING_SORTS = ['newest', 'price_asc', 'price_desc', 'relevance'] as const
export type ListingSort = (typeof LISTING_SORTS)[number]

export const LISTING_PARAMETERS = [
  'category',
  'nav',
  'brand',
  'shop',
  'price_min_minor',
  'price_max_minor',
  'in_stock',
  'q',
  'sort',
  'page',
  'per_page',
] as const

// The `product_listings` array a filterable attribute's values are matched in (docs/04a §7.12).
export type ListingColumn = 'audience_value_ids' | 'size_value_ids' | 'color_value_ids'

export type FilterableAttribute = {
  column: ListingColumn
  // Active value code → value ID.
  values: ReadonlyMap<string, string>
}

export type ListingFilters = {
  categorySlug: string | null
  // One entry per attribute filtered: a row matches when its column holds any of the IDs.
  valueFilters: { column: ListingColumn; ids: string[] }[]
  brandSlugs: string[]
  shopSlug: string | null
  priceMinMinor: number | null
  priceMaxMinor: number | null
  inStock: boolean
  q: string | null
  sort: ListingSort
  page: number
  perPage: number
}

export type ListingProblem = { parameter: string; message: string }

export const MAX_FILTER_VALUES = 20
export const DEFAULT_PER_PAGE = 24
const MAX_PROBLEMS = 20

const CATEGORY_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
const BRAND_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
const SHOP_SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
const NAV_PATH = /^[a-z]+(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/
// Fifteen digits stay below Number.MAX_SAFE_INTEGER; no leading zero.
const MINOR = /^(?:0|[1-9]\d{0,14})$/
const WHOLE = /^[1-9]\d{0,2}$/
// PostgreSQL refuses a NUL in text, so control characters are refused before any query.
// eslint-disable-next-line no-control-regex -- control characters are what this refuses
const CONTROL = /[\u0000-\u001f\u007f]/

export function parseListingQuery(
  query: Record<string, unknown>,
  filterable: ReadonlyMap<string, FilterableAttribute>
): { filters: ListingFilters | null; problems: ListingProblem[] } {
  const problems: ListingProblem[] = []
  // One problem per parameter, at most MAX_PROBLEMS; a parameter name is cut to 64 characters.
  const refuse = (parameter: string, message: string) => {
    const name = parameter.slice(0, 64)
    if (problems.length >= MAX_PROBLEMS || problems.some((p) => p.parameter === name)) return
    problems.push({ parameter: name, message })
  }
  const known = new Set<string>([...LISTING_PARAMETERS, ...filterable.keys()])
  for (const name of Object.keys(query)) {
    if (!known.has(name)) refuse(name, 'Unknown query parameter.')
  }

  // One value: a string sent once; undefined when absent.
  const one = (name: string): string | undefined => {
    const value = query[name]
    if (value === undefined) return undefined
    if (typeof value !== 'string') {
      refuse(name, 'Send this parameter once.')
      return undefined
    }
    return value
  }
  // Repeated values: one string or a list of strings, at most MAX_FILTER_VALUES.
  const many = (name: string): string[] => {
    const value = query[name]
    if (value === undefined) return []
    const list = Array.isArray(value) ? value : [value]
    if (!list.every((item) => typeof item === 'string')) {
      refuse(name, 'Send each value as text.')
      return []
    }
    if (list.length > MAX_FILTER_VALUES) {
      refuse(name, `Send at most ${MAX_FILTER_VALUES} values.`)
      return []
    }
    return [...new Set(list as string[])]
  }
  const shaped = (name: string, pattern: RegExp, message: string) => {
    const value = one(name)
    if (value === undefined) return null
    if (!pattern.test(value)) {
      refuse(name, message)
      return null
    }
    return value
  }
  const bounded = (name: string, min: number, max: number, fallback: number) => {
    const value = one(name)
    if (value === undefined) return fallback
    const number = WHOLE.test(value) ? Number(value) : Number.NaN
    if (!(number >= min && number <= max)) {
      refuse(name, `Send a whole number from ${min} to ${max}.`)
      return fallback
    }
    return number
  }
  const minor = (name: string) => {
    const value = one(name)
    if (value === undefined) return null
    if (!MINOR.test(value)) {
      refuse(name, 'Send an amount in paisa, a whole number.')
      return null
    }
    return Number(value)
  }

  let categorySlug = shaped('category', CATEGORY_SLUG, 'Send one category slug.')
  const valueFilters: ListingFilters['valueFilters'] = []
  const navPath = shaped('nav', NAV_PATH, 'Send one navigation entry, such as men/t-shirts.')
  if (navPath !== null) {
    const entry = navigationEntry(`/${navPath}`)
    if (!entry) {
      refuse('nav', 'This navigation entry does not exist.')
    } else if (query.category !== undefined || query.audience !== undefined) {
      refuse('nav', 'A navigation entry sets the audience and the category; send it alone.')
    } else {
      categorySlug = entry.categorySlug
      const audience = filterable.get('audience')
      const id = audience?.values.get(entry.audience)
      if (audience && id) valueFilters.push({ column: audience.column, ids: [id] })
      else refuse('nav', 'This navigation entry names an audience that is not offered.')
    }
  }

  for (const [code, attribute] of filterable) {
    const codes = many(code)
    if (codes.length === 0) continue
    const ids: string[] = []
    for (const valueCode of codes) {
      const id = attribute.values.get(valueCode)
      if (id === undefined) refuse(code, 'A value sent is not one this filter offers.')
      else ids.push(id)
    }
    if (ids.length === codes.length) valueFilters.push({ column: attribute.column, ids })
  }

  const brandSlugs = many('brand')
  for (const slug of brandSlugs) {
    if (!BRAND_SLUG.test(slug)) refuse('brand', 'Send brand slugs.')
  }
  const shopSlug = shaped('shop', SHOP_SLUG, 'Send one shop slug.')
  const priceMinMinor = minor('price_min_minor')
  const priceMaxMinor = minor('price_max_minor')
  if (priceMinMinor !== null && priceMaxMinor !== null && priceMinMinor > priceMaxMinor) {
    refuse('price_min_minor', 'The lowest price is above the highest.')
  }
  const inStockText = one('in_stock')
  if (inStockText !== undefined && inStockText !== 'true') {
    refuse('in_stock', 'Send in_stock=true, or leave it out.')
  }

  let q: string | null = null
  const qText = one('q')
  if (qText !== undefined) {
    // A hyphen that does not join two letters or digits is dropped: `-` means NOT to websearch_to_tsquery.
    const searched = qText.replaceAll(/(^|[^\p{L}\p{N}])-+/gu, '$1').trim()
    const length = [...searched].length
    if (CONTROL.test(searched)) refuse('q', 'Send letters, numbers and punctuation only.')
    else if (length < 2 || length > 100) refuse('q', 'Send 2 to 100 characters.')
    else q = searched
  }

  const sortText = one('sort')
  let sort: ListingSort = q === null ? 'newest' : 'relevance'
  if (sortText !== undefined) {
    if (!(LISTING_SORTS as readonly string[]).includes(sortText)) {
      refuse('sort', `Use one of: ${LISTING_SORTS.join(', ')}.`)
    } else if (sortText === 'relevance' && q === null && qText === undefined) {
      refuse('sort', 'Sort by relevance only with a search (q).')
    } else {
      sort = sortText as ListingSort
    }
  }
  const page = bounded('page', 1, 100, 1)
  const perPage = bounded('per_page', 1, 48, DEFAULT_PER_PAGE)

  if (problems.length > 0) return { filters: null, problems }
  return {
    filters: {
      categorySlug,
      valueFilters,
      brandSlugs,
      shopSlug,
      priceMinMinor,
      priceMaxMinor,
      inStock: inStockText === 'true',
      q,
      sort,
      page,
      perPage,
    },
    problems,
  }
}

// The capped total of docs/06 §6.1: a count of at most 10,001 rows reported as at most 10,000.
export const LISTING_TOTAL_CAP = 10_000

export function cappedTotal(counted: number) {
  return { total: Math.min(counted, LISTING_TOTAL_CAP), totalIsCapped: counted > LISTING_TOTAL_CAP }
}

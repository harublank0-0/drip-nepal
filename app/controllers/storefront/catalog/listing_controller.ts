import type { HttpContext } from '@adonisjs/core/http'
import { appUrl, mediaPublicUrl } from '#config/storefront'
import { DomainError } from '#exceptions/domain_error'
import { cappedTotal, parseListingQuery } from '#modules/catalog/domain/listing_query'
import { navigationEntry, type NavigationEntry } from '#modules/catalog/navigation'
import {
  activeCategoryTree,
  filterableAttributes,
  listedCategoryPath,
  listingFilterAttributes,
  listingPage,
} from '#modules/catalog/queries'
import {
  filterAttributeJson,
  listingPageCardJson,
} from '#transformers/catalog/storefront_transformer'
import {
  EMPTY_LISTING_STATE,
  isUnrefined,
  listingUrl,
  type ListingUrlState,
} from '#shared/ui/listing_url'

/*
 * The storefront listing pages (docs/08 §2.2, §11.1; 01 AC-FR-SRCH-001-1 to
 * -4, AC-FR-SRCH-005-2; ADR-0017 decisions 6 and 8; R1-S part 3d-i):
 * `/men`, `/women` and the navigation entries below them (fixed routes, one
 * per entry of `navigation.ts`, no catch-all), `/c/{categorySlug}` and
 * `/search`. They read the listing as `listProducts` does, with the same
 * parser and allowlist (06 §2.1, §6.3).
 *
 * - The path carries the navigation entry or the category, so `nav` never
 *   appears in a page URL, `category` only on `/search`, and `audience` not
 *   on a navigation entry's page. Any parameter the page does not take, or
 *   takes but finds invalid, is dropped with a 301 to the remaining URL in
 *   canonical order (AC-FR-SRCH-001-3, AC-J01-03), `Cache-Control: public,
 *   max-age=86400` as every 301 (ADR-0017 decision 6).
 * - The canonical link names the unrefined listing's first page; a later
 *   page of an unrefined listing names itself with its `page`. `/search`,
 *   a page past the last and a refined view with no matches are `noindex`;
 *   the first page of an empty category stays indexable (ADR-0017 decision
 *   8).
 * - A category that is not listed, like an unknown one, is the 404 page.
 */

type Base = {
  kind: 'navigation' | 'category' | 'search'
  path: string
  heading: string
  categorySlug: string | null
  audience: string | null
  breadcrumbs: { label: string; href: string }[]
}

// The parameters a page takes beyond the listing's own: none, and fewer on some pages.
function refusedOn(base: Base): string[] {
  const refused = ['nav']
  if (base.kind !== 'search') refused.push('category')
  if (base.kind === 'navigation') refused.push('audience')
  return refused
}

function asList(value: unknown): string[] {
  if (value === undefined) return []
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === 'string'
  )
}

// The query in URL form, from parameters the parser accepted.
function stateOf(query: Record<string, unknown>, codes: readonly string[]): ListingUrlState {
  const one = (name: string) => (typeof query[name] === 'string' ? (query[name] as string) : null)
  const number = (name: string) => (one(name) === null ? null : Number(one(name)))
  const q = one('q')?.trim() ?? null
  return {
    q,
    category: one('category'),
    values: Object.fromEntries(codes.map((code) => [code, asList(query[code])])),
    brand: asList(query.brand),
    shop: one('shop'),
    priceMinMinor: number('price_min_minor'),
    priceMaxMinor: number('price_max_minor'),
    inStock: one('in_stock') === 'true',
    sort: one('sort'),
    page: number('page') ?? 1,
    perPage: number('per_page') ?? EMPTY_LISTING_STATE.perPage,
  }
}

const absolute = (path: string) => `${appUrl}${path}`

// The top-level categories, which an empty listing suggests (AC-FR-SRCH-002-4).
async function topCategories() {
  const tree = await activeCategoryTree()
  return tree.map((node) => ({ slug: node.slug, name: node.name }))
}

export default class ListingController {
  async navigation(ctx: HttpContext) {
    const entry = navigationEntry(ctx.route!.pattern) as NavigationEntry
    const audienceEntry = navigationEntry(`/${entry.audience}`)!
    return this.render(ctx, {
      kind: 'navigation',
      path: entry.path,
      heading: entry.title,
      categorySlug: entry.categorySlug,
      audience: entry.audience,
      breadcrumbs:
        entry.categorySlug === null
          ? [{ label: entry.title, href: entry.path }]
          : [
              { label: audienceEntry.title, href: audienceEntry.path },
              { label: entry.label, href: entry.path },
            ],
    })
  }

  async category(ctx: HttpContext) {
    const slug = ctx.params.categorySlug as string
    const path = await listedCategoryPath(slug)
    if (path === null) throw new DomainError('NOT_FOUND')
    const tree = await activeCategoryTree()
    const trail: { label: string; href: string }[] = []
    let level = tree
    for (const segment of path.split('/').filter(Boolean)) {
      const node = level.find((item) => item.slug === segment)
      if (!node) break
      trail.push({ label: node.name, href: `/c/${node.slug}` })
      level = node.children
    }
    return this.render(ctx, {
      kind: 'category',
      path: `/c/${slug}`,
      heading: trail.at(-1)?.label ?? slug,
      categorySlug: slug,
      audience: null,
      breadcrumbs: trail,
    })
  }

  async search(ctx: HttpContext) {
    return this.render(ctx, {
      kind: 'search',
      path: '/search',
      heading: '',
      categorySlug: null,
      audience: null,
      breadcrumbs: [],
    })
  }

  private async render(ctx: HttpContext, base: Base) {
    const filterable = await listingFilterAttributes()
    const codes = [...filterable.keys()]
    const query: Record<string, unknown> = { ...ctx.request.qs() }
    const dropped = refusedOn(base).filter((name) => name in query)
    for (const name of dropped) delete query[name]
    const parsed = parseListingQuery(query, filterable)
    if (dropped.length > 0 || parsed.problems.length > 0) {
      // Drop what the page refused or found invalid, then whatever that leaves invalid.
      for (const problem of parsed.problems) delete query[problem.parameter]
      const again = parseListingQuery(query, filterable)
      for (const problem of again.problems) delete query[problem.parameter]
      ctx.response.header('Cache-Control', 'public, max-age=86400')
      return ctx.response
        .redirect()
        .status(301)
        .toPath(listingUrl(base.path, stateOf(query, codes)))
    }
    const filters = parsed.filters!
    if (base.categorySlug !== null) filters.categorySlug = base.categorySlug
    const audienceId =
      base.audience === null ? undefined : filterable.get('audience')?.values.get(base.audience)
    if (audienceId !== undefined) {
      filters.valueFilters.push({ column: 'audience_value_ids', ids: [audienceId] })
    }

    const { rows, counted } = await listingPage(filters)
    const { total, totalIsCapped } = cappedTotal(counted)
    const state = stateOf(query, codes)
    const unrefined = isUnrefined(state)
    const pages = Math.min(Math.max(Math.ceil(total / filters.perPage), 1), 100)
    const canonicalState: ListingUrlState = {
      ...EMPTY_LISTING_STATE,
      q: state.q,
      category: state.category,
      page: unrefined ? state.page : 1,
    }
    const noindex =
      base.kind === 'search' ||
      (rows.length === 0 && filters.page > 1) ||
      (!unrefined && counted === 0)
    const categoryPath =
      filters.categorySlug === null ? null : await listedCategoryPath(filters.categorySlug)
    const attributes = await filterableAttributes(categoryPath)
    const facets = attributes.filter(
      (attribute) => !(base.kind === 'navigation' && attribute.code === 'audience')
    )
    const suggestions = counted === 0 ? await topCategories() : []

    return ctx.inertia.render('storefront/listing', {
      base: {
        kind: base.kind,
        path: base.path,
        heading: base.heading,
        breadcrumbs: base.breadcrumbs,
      },
      listing: {
        cards: rows
          .slice(0, filters.perPage)
          .map((row) => listingPageCardJson(row, mediaPublicUrl)),
        meta: {
          page: filters.page,
          per_page: filters.perPage,
          pages,
          total,
          total_is_capped: totalIsCapped,
          has_more: rows.length > filters.perPage,
        },
      },
      query: {
        q: state.q,
        category: state.category,
        values: Object.fromEntries(
          Object.entries(state.values).map(([code, values]) => [code, [...values]])
        ),
        brand: [...state.brand],
        shop: state.shop,
        price_min_minor: state.priceMinMinor,
        price_max_minor: state.priceMaxMinor,
        in_stock: state.inStock,
        sort: state.sort ?? filters.sort,
        page: filters.page,
        per_page: filters.perPage,
      },
      facets: facets.map(filterAttributeJson),
      suggestions,
      seo: { canonical: absolute(listingUrl(base.path, canonicalState)), noindex },
    })
  }
}

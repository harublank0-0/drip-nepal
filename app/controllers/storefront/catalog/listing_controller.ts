import type { HttpContext } from '@adonisjs/core/http'
import { appUrl, mediaPublicUrl } from '#config/storefront'
import { DomainError } from '#exceptions/domain_error'
import { cappedTotal, parseListingQuery } from '#modules/catalog/domain/listing_query'
import { navigationEntry, type NavigationEntry } from '#modules/catalog/navigation'
import {
  activeCategoryTree,
  type CategoryTreeNode,
  filterableAttributes,
  listedBrands,
  listedCategoryPath,
  listingFilterAttributes,
  listingPage,
} from '#modules/catalog/queries'
import {
  brandOptionJson,
  filterAttributeJson,
  filterCategoryJson,
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
 * - A category that is not listed, like an unknown one, is the 404 page,
 *   and so is a navigation entry whose category is not listed or whose
 *   audience value is not offered: never an indexable empty page.
 */

type Base = {
  kind: 'navigation' | 'category' | 'search'
  path: string
  heading: string
  categorySlug: string | null
  // The listed category's path, read once by the caller.
  categoryPath: string | null
  audience: string | null
  breadcrumbs: { label: string; href: string }[]
  tree?: CategoryTreeNode[]
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
function topCategoriesOf(tree: CategoryTreeNode[]) {
  return tree.map((node) => ({ slug: node.slug, name: node.name }))
}

export default class ListingController {
  async navigation(ctx: HttpContext) {
    const entry = navigationEntry(ctx.route!.pattern) as NavigationEntry
    const audienceEntry = navigationEntry(`/${entry.audience}`)!
    const categoryPath =
      entry.categorySlug === null ? null : await listedCategoryPath(entry.categorySlug)
    if (entry.categorySlug !== null && categoryPath === null) throw new DomainError('NOT_FOUND')
    return this.render(ctx, {
      kind: 'navigation',
      path: entry.path,
      heading: entry.title,
      categorySlug: entry.categorySlug,
      categoryPath,
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
      categoryPath: path,
      audience: null,
      breadcrumbs: trail,
      tree,
    })
  }

  async search(ctx: HttpContext) {
    return this.render(ctx, {
      kind: 'search',
      path: '/search',
      heading: '',
      categorySlug: null,
      categoryPath: null,
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
    let audienceValueId: string | null = null
    if (base.audience !== null) {
      const audienceId = filterable.get('audience')?.values.get(base.audience)
      // An audience no longer offered would list every audience: the page is gone instead.
      if (audienceId === undefined) throw new DomainError('NOT_FOUND')
      audienceValueId = audienceId
      filters.valueFilters.push({ column: 'audience_value_ids', ids: [audienceId] })
    }

    const { rows, counted } = await listingPage(filters)
    const { total, totalIsCapped } = cappedTotal(counted)
    // `q` as searched: the parser drops hyphens that would exclude.
    const state = { ...stateOf(query, codes), q: filters.q }
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
      base.categorySlug !== null
        ? base.categoryPath
        : filters.categorySlug === null
          ? null
          : await listedCategoryPath(filters.categorySlug)
    const attributes = await filterableAttributes(categoryPath)
    /*
     * A value the URL selects for an attribute this category does not use
     * (a category chosen on `/search` after it) keeps its group, so its chip
     * has a label and its box can be unticked.
     */
    const kept = Object.keys(state.values).filter(
      (code) =>
        state.values[code].length > 0 && !attributes.some((attribute) => attribute.code === code)
    )
    if (kept.length > 0) {
      const all = await filterableAttributes(null)
      attributes.push(...all.filter((attribute) => kept.includes(attribute.code)))
    }
    const facets = attributes.filter(
      (attribute) => !(base.kind === 'navigation' && attribute.code === 'audience')
    )
    // `/search` takes a category, so it offers the category tree (part 3d-i-b).
    const tree =
      base.tree ??
      (counted === 0 || base.kind === 'search' ? await activeCategoryTree() : undefined)
    const suggestions = counted === 0 && tree ? topCategoriesOf(tree) : []
    const brands = await listedBrands({
      categoryPath,
      audienceValueId,
      selected: state.brand,
    })

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
      brands: brands.map(brandOptionJson),
      categories: base.kind === 'search' && tree ? tree.map(filterCategoryJson) : [],
      suggestions,
      seo: { canonical: absolute(listingUrl(base.path, canonicalState)), noindex },
    })
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { closedQuery, invalidParameter, invalidParameters } from '#controllers/support/cursor'
import { cappedTotal, parseListingQuery } from '#modules/catalog/domain/listing_query'
import {
  activeCategoryTree,
  filterableAttributes,
  listedCategoryPath,
  listingFilterAttributes,
  listingPage,
  storefrontProduct,
} from '#modules/catalog/queries'
import {
  categoryNodeJson,
  filterAttributeJson,
  listingCardJson,
  storefrontProductJson,
} from '#transformers/catalog/storefront_transformer'
import { listAttributesValidator } from '#validators/catalog/storefront'

/*
 * The storefront's reference reads (docs/06 §13.2; R1-S part 3a), open to
 * anyone, signed in or not; the API limits middleware charges `catalog_ip`
 * per client network first (06 §9.1). Both lists are bounded by the
 * reference data, so they take no cursor and answer `{ data: [...] }`
 * without `meta` (06 §6.2 "Bounded lists"). A query parameter outside the
 * closed list, or a malformed or repeated one, is 400
 * `INVALID_QUERY_PARAMETER` (06 §6.3). Routes in
 * start/routes/api_v1/public.ts, named by their operationIds.
 */
export default class CatalogController {
  // listCategories: the active category tree.
  async listCategories(ctx: HttpContext) {
    closedQuery(ctx, [])
    const tree = await activeCategoryTree()
    return { data: tree.map(categoryNodeJson) }
  }

  /*
   * listAttributes: the filterable attributes, all of them or those of a
   * category, its ancestors and its listed descendants (`filterableAttributes`).
   * A well-formed slug that names no listed category (unknown, inactive, or
   * under an inactive parent) answers an empty list.
   */
  async listAttributes(ctx: HttpContext) {
    closedQuery(ctx, ['category'])
    const [error, input] = await ctx.request.tryValidateUsing(listAttributesValidator)
    if (error) throw invalidParameter('category', 'Send one category slug.')
    let path: string | null = null
    if (input.category !== undefined) {
      path = await listedCategoryPath(input.category)
      if (path === null) return { data: [] }
    }
    const attributes = await filterableAttributes(path)
    return { data: attributes.map(filterAttributeJson) }
  }

  /*
   * listProducts: one page of the storefront listing (06 §6.1, §6.3; R1-S
   * part 3b). Every problem with the query, an unknown parameter included,
   * is one 400 `INVALID_QUERY_PARAMETER` naming each parameter. `meta`
   * carries the page, its size, the capped total and `has_more`; a page past
   * the last answers an empty `data` with 200.
   */
  async listProducts(ctx: HttpContext) {
    const filterable = await listingFilterAttributes()
    const { filters, problems } = parseListingQuery(ctx.request.qs(), filterable)
    if (!filters) throw invalidParameters(problems)
    const { rows, counted } = await listingPage(filters)
    const { total, totalIsCapped } = cappedTotal(counted)
    return {
      data: rows.slice(0, filters.perPage).map(listingCardJson),
      meta: {
        page: filters.page,
        per_page: filters.perPage,
        total,
        total_is_capped: totalIsCapped,
        has_more: rows.length > filters.perPage,
      },
    }
  }

  /*
   * getProduct: the storefront product by its public ID (06 §13.2; R1-S part
   * 3c). A product that is not published, or of a shop that is not active,
   * is 404 like a missing one; the route matches the public ID's shape
   * (04a §7.6), so any other path segment is 404 before this runs.
   */
  async getProduct(ctx: HttpContext) {
    closedQuery(ctx, [])
    const product = await storefrontProduct(ctx.params.publicId)
    if (!product) throw new DomainError('NOT_FOUND')
    return { data: storefrontProductJson(product) }
  }
}

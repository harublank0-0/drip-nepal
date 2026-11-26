import type { HttpContext } from '@adonisjs/core/http'
import { closedQuery, invalidParameter } from '#controllers/support/cursor'
import {
  activeCategoryTree,
  filterableAttributes,
  listedCategoryPath,
} from '#modules/catalog/queries'
import { categoryNodeJson, filterAttributeJson } from '#transformers/catalog/storefront_transformer'
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
}

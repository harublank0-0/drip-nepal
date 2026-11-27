import type { HttpContext } from '@adonisjs/core/http'
import { LIST_PRODUCT_STATUSES } from '#modules/catalog/queries'
import { listInventory } from '#modules/inventory/queries'
import { assertShopGate, assertShopPermission } from '#modules/shops/permissions'
import { inventoryListItemJson } from '#transformers/seller/inventory_transformer'
import {
  listRequest,
  oneOf,
  pathWithoutRefused,
  textFilter,
  type ListRequest,
} from '#controllers/support/cursor'

/*
 * `/seller/{shopSlug}/inventory`, the stock page (docs/08 §2.5 `/inventory`
 * row; 02 J-11; R1-S part 2f-iv-a), behind `auth` then `seller_context`
 * (T-SEC-005), rendered in the browser in the seller layout. GET only
 * (ADR-0004); the stock changes are `adjustInventory` ⚷ and
 * `stocktakeInventory` ⚷ under `/api/v1`. Gated as `listInventory`, the
 * operation it reads (07 §4.5 "Page routes"): `shop.products.view`, while
 * the shop is `active` or `suspended` (`products_view`). Never stored
 * (`private, no-store`).
 *
 * Its props are one cursor page of `listInventory` (`inventory`: each
 * product with its active variants' stock) and the filters it read
 * (`filters`), with the operation's own parameters (`status`, `q`,
 * `cursor`, `limit`; 06 §6.3). A parameter the list refuses is dropped by a
 * redirect to the same page without it (08 §7.2), as on the product list.
 */
const LIST_PARAMETERS = ['status', 'q'] as const

export default class InventoryController {
  async index(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'private, no-store')
    assertShopPermission(ctx.shop, 'shop.products.view')
    assertShopGate(ctx.shop, 'products_view')
    let status: (typeof LIST_PRODUCT_STATUSES)[number] | undefined
    let q: string | undefined
    let list: ListRequest
    try {
      status = oneOf(ctx, 'status', LIST_PRODUCT_STATUSES)
      q = textFilter(ctx, 'q', 100)
      list = listRequest(ctx, {
        sort: 'updated_desc',
        keyKind: 'timestamp',
        parameters: LIST_PARAMETERS,
        filters: { status, q },
      })
    } catch (error) {
      const path = pathWithoutRefused(ctx, error)
      if (path === null) throw error
      return ctx.response.redirect().toPath(path)
    }
    const result = await listInventory({
      shopId: ctx.shop.id,
      status,
      q,
      limit: list.limit,
      seek: list.seek,
    })
    return ctx.inertia.render('seller/inventory', {
      inventory: {
        items: result.items.map(inventoryListItemJson),
        meta: list.meta(result.last),
      },
      filters: { status: status ?? null, q: q ?? null },
    })
  }
}

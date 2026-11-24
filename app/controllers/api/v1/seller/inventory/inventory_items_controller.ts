import type { HttpContext } from '@adonisjs/core/http'
import { LIST_PRODUCT_STATUSES } from '#modules/catalog/queries'
import { adjustInventory } from '#modules/inventory/actions/adjust_inventory'
import { stocktakeInventory } from '#modules/inventory/actions/stocktake_inventory'
import { listInventory } from '#modules/inventory/queries'
import { assertShopGate, assertShopPermission } from '#modules/shops/permissions'
import {
  inventoryChangeJson,
  inventoryListItemJson,
} from '#transformers/seller/inventory_transformer'
import { closedQuery, listRequest, oneOf, textFilter } from '#controllers/support/cursor'
import { idempotencyScope, sellerActor, sendIdempotent } from '#controllers/support/http'
import { assertKnownMembers } from '#validators/support/strict_keys'
import {
  ADJUST_INVENTORY_MEMBERS,
  adjustInventoryValidator,
} from '#validators/inventory/adjust_inventory'
import {
  STOCKTAKE_INVENTORY_MEMBERS,
  stocktakeInventoryValidator,
} from '#validators/inventory/stocktake_inventory'

/*
 * The seller's stock (docs/06 §13.5, §14.3; 05 §5.9; 02 J-11; R1-S part
 * 2c). Routes in start/routes/api_v1/seller.ts, named by their
 * operationIds, behind `auth` and `seller_context`, which answers another
 * shop's slug with the 404 of an unknown one; a variant of another shop is
 * the same 404 (T-SEC-001). Each checks its permission, then the status gate
 * of docs/07 §4.4: the list opens while the shop is `active` or `suspended`
 * (`products_view`), the writes while it is `active` (`products_edit`, the
 * "products edit, publish; inventory" column).
 *
 * - `listInventory` (`shop.products.view`): a cursor list by product (06
 *   §6.2, §6.3), newest change first, `status` (default: every product but
 *   the archived ones) and `q` (a title or SKU prefix, 1 to 100
 *   characters); `low_stock` is R2, so it is an unknown parameter.
 * - `adjustInventory` ⚷ and `stocktakeInventory` ⚷
 *   (`shop.inventory.adjust`): 201 with the stock row and the movement; a
 *   replay returns the stored answer with `Idempotency-Replayed`.
 *
 * Unknown body members are 422 `unknown_field` before the validator
 * (T-SEC-003); no write takes a query parameter (the validator reads the
 * query and body merged).
 */
const LIST_PARAMETERS = ['status', 'q'] as const

export default class InventoryItemsController {
  // listInventory
  async index(ctx: HttpContext) {
    assertShopPermission(ctx.shop, 'shop.products.view')
    assertShopGate(ctx.shop, 'products_view')
    const status = oneOf(ctx, 'status', LIST_PRODUCT_STATUSES)
    const q = textFilter(ctx, 'q', 100)
    const list = listRequest(ctx, {
      sort: 'updated_desc',
      keyKind: 'timestamp',
      parameters: LIST_PARAMETERS,
      filters: { status, q },
    })
    const result = await listInventory({
      shopId: ctx.shop.id,
      status,
      q,
      limit: list.limit,
      seek: list.seek,
    })
    return { data: result.items.map(inventoryListItemJson), meta: list.meta(result.last) }
  }

  // adjustInventory ⚷
  async adjust(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertShopPermission(ctx.shop, 'shop.inventory.adjust')
    assertShopGate(ctx.shop, 'products_edit')
    assertKnownMembers(ctx.request.body(), ADJUST_INVENTORY_MEMBERS)
    const input = await ctx.request.validateUsing(adjustInventoryValidator)
    const result = await adjustInventory(
      {
        shopId: ctx.shop.id,
        variantId: ctx.params.variantId,
        delta: input.delta,
        reasonCode: input.reason_code,
        note: input.note ?? null,
      },
      {
        actor: sellerActor(ctx),
        idempotency: idempotencyScope(ctx, 'adjustInventory', input),
        present: (change) => ({ data: inventoryChangeJson(change) }),
      }
    )
    return sendIdempotent(ctx, result)
  }

  // stocktakeInventory ⚷
  async stocktake(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertShopPermission(ctx.shop, 'shop.inventory.adjust')
    assertShopGate(ctx.shop, 'products_edit')
    assertKnownMembers(ctx.request.body(), STOCKTAKE_INVENTORY_MEMBERS)
    const input = await ctx.request.validateUsing(stocktakeInventoryValidator)
    const result = await stocktakeInventory(
      {
        shopId: ctx.shop.id,
        variantId: ctx.params.variantId,
        countedQuantity: input.counted_quantity,
        expectedOnHand: input.expected_on_hand,
      },
      {
        actor: sellerActor(ctx),
        idempotency: idempotencyScope(ctx, 'stocktakeInventory', input),
        present: (change) => ({ data: inventoryChangeJson(change) }),
      }
    )
    return sendIdempotent(ctx, result)
  }
}

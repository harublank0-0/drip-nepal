import { DomainError } from '#exceptions/domain_error'
import type { StockChange } from '#modules/inventory/domain/stock_change'
import {
  belowReserved,
  guardedStockUpdate,
  recordVendorChange,
} from '#modules/inventory/internal/vendor_stock'
import type { Actor } from '#modules/platform/actor'
import { idempotentTx, type IdempotencyScope } from '#modules/platform/idempotency'

/*
 * `stocktakeInventory` ⚷ (docs/06 §13.5, §14.3; 05 §5.9; 01 FR-INV-003; 02
 * J-11 step 3; R1-S part 2c). The controller has checked
 * `shop.inventory.adjust` and the status gate and validated
 * `counted_quantity` and `expected_on_hand`, the `on_hand` the vendor's
 * screen showed. In one transaction, behind the key:
 *
 *   UPDATE inventory_items SET on_hand = :counted, version = version + 1
 *    WHERE variant_id = :v AND shop_id = :shop
 *      AND on_hand = :expected_on_hand AND :counted >= reserved
 *
 * with the lock, refusals and side effects of `internal/vendor_stock.ts`.
 * `on_hand` no longer equal to `expected_on_hand` is 409 `stock_changed` on
 * `expected_on_hand` with the current `on_hand` and `reserved`, whatever
 * the count; then a count below `reserved` is 409 `below_reserved` on
 * `counted_quantity`. One `stocktake` movement of `counted -
 * expected_on_hand`, even 0, since a count that confirmed the number is
 * journaled too (AC-FR-INV-003-1, AC-J11-08); one `inventory.stocktake`
 * audit row; `catalog.refresh_listing` when `on_hand` changed.
 */
export type StocktakeInventoryCommand = {
  shopId: string
  variantId: string
  countedQuantity: number
  expectedOnHand: number
}

export async function stocktakeInventory<T>(
  command: StocktakeInventoryCommand,
  context: {
    actor: Actor
    idempotency: IdempotencyScope
    present: (change: StockChange) => T
  }
) {
  const scope = { shopId: command.shopId, variantId: command.variantId }
  return idempotentTx(context.idempotency, async (trx, keyId) => {
    const { before, after } = await guardedStockUpdate(
      trx,
      scope,
      {
        sql: `UPDATE inventory_items SET on_hand = ?, version = version + 1
               WHERE variant_id = ? AND shop_id = ?
                 AND on_hand = ? AND ? >= reserved
               RETURNING variant_id, on_hand, reserved, version`,
        bindings: [
          command.countedQuantity,
          command.variantId,
          command.shopId,
          command.expectedOnHand,
          command.countedQuantity,
        ],
      },
      async (row) => {
        if (row.onHand !== command.expectedOnHand) {
          return new DomainError('CONFLICT', {
            detail:
              'Stock changed while you were counting. Check the new number and confirm again.',
            errors: [
              {
                field: 'expected_on_hand',
                code: 'stock_changed',
                message: `On hand is now ${row.onHand}.`,
                on_hand: row.onHand,
                reserved: row.reserved,
              },
            ],
          })
        }
        return command.countedQuantity < row.reserved
          ? belowReserved(trx, scope, 'counted_quantity', row)
          : null
      }
    )
    const change = await recordVendorChange(
      trx,
      {
        shopId: command.shopId,
        keyId,
        kind: 'stocktake',
        onHandDelta: command.countedQuantity - command.expectedOnHand,
        reasonCode: 'stocktake',
        note: null,
        before,
        after,
      },
      context.actor
    )
    return { status: 201, body: context.present(change) }
  })
}

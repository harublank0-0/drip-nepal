import { DomainError } from '#exceptions/domain_error'
import type { VendorAdjustmentReason } from '#modules/inventory/domain/movement_reasons'
import { STOCK_MAX } from '#modules/inventory/domain/stock_limits'
import type { StockChange } from '#modules/inventory/domain/stock_change'
import {
  belowReserved,
  guardedStockUpdate,
  recordVendorChange,
} from '#modules/inventory/internal/vendor_stock'
import type { Actor } from '#modules/platform/actor'
import { idempotentTx, type IdempotencyScope } from '#modules/platform/idempotency'

/*
 * `adjustInventory` ⚷ (docs/06 §13.5, §14.3; 05 §5.9; 01 FR-INV-001; 02
 * J-11 step 2; R1-S part 2c). The controller has checked
 * `shop.inventory.adjust` and the status gate (an `active` shop) and
 * validated a non-zero integer `delta`, one of the six vendor reasons and an
 * optional note. In one transaction, behind the key (the key row is its
 * first statement, 06 §7.3):
 *
 *   UPDATE inventory_items SET on_hand = on_hand + :delta, version = version + 1
 *    WHERE variant_id = :v AND shop_id = :shop AND on_hand + :delta >= reserved
 *
 * with the lock, refusals and side effects of `internal/vendor_stock.ts`: a
 * result below `reserved` is 409 `below_reserved` on `delta`; one above the
 * column's limit is 422 `max` on `delta`. One `adjustment` movement, one
 * `inventory.adjust` audit row, `catalog.refresh_listing`. A replay of the
 * key returns the stored 201 and changes stock once (AC-FR-INV-001-4).
 */
export type AdjustInventoryCommand = {
  shopId: string
  variantId: string
  delta: number
  reasonCode: VendorAdjustmentReason
  note: string | null
}

export async function adjustInventory<T>(
  command: AdjustInventoryCommand,
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
        sql: `UPDATE inventory_items SET on_hand = on_hand + ?, version = version + 1
               WHERE variant_id = ? AND shop_id = ?
                 AND on_hand::bigint + ? BETWEEN reserved AND ${STOCK_MAX}
               RETURNING variant_id, on_hand, reserved, version`,
        bindings: [command.delta, command.variantId, command.shopId, command.delta],
      },
      async (row) => {
        const result = row.onHand + command.delta
        if (result > STOCK_MAX) {
          return new DomainError('VALIDATION_FAILED', {
            detail: 'Some fields need attention.',
            errors: [
              {
                field: 'delta',
                code: 'max',
                message: `On hand cannot go above ${STOCK_MAX}.`,
              },
            ],
          })
        }
        return result < row.reserved ? belowReserved(trx, scope, 'delta', row) : null
      }
    )
    const change = await recordVendorChange(
      trx,
      {
        shopId: command.shopId,
        keyId,
        kind: 'adjustment',
        onHandDelta: command.delta,
        reasonCode: command.reasonCode,
        note: command.note,
        before,
        after,
      },
      context.actor
    )
    return { status: 201, body: context.present(change) }
  })
}

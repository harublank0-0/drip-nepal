import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError, type ProblemErrorItem } from '#exceptions/domain_error'
import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { reservedSplit } from '#modules/inventory/queries'
import type { Actor } from '#modules/platform/actor'
import { sendJob } from '#modules/platform/jobs'

/*
 * What `adjustInventory` and `stocktakeInventory` share (docs/05 §5.9,
 * §8.13; R1-S part 2c). Each first reads the stock row `FOR UPDATE` inside
 * the shop's scope, never by `variant_id` alone: no row is 404, as for a
 * missing variant, so another shop's stock never reaches the answer
 * (T-SEC-001). Under that lock it runs one conditional update, guarded so
 * that `on_hand` never falls below `reserved` (05 §5.9). When the update
 * changes nothing, the locked row says why: 409 `CONFLICT` with the reason,
 * and the transaction, key row included, rolls back, so nothing is written
 * and the vendor confirms again with a new key. The lock also gives the
 * audit row its `on_hand` before the change.
 *
 * Then one movement referencing the key row, one audit row and the listing
 * refresh, all in the same transaction. Only the stock row is locked (level
 * 7 of 05 §4.4), so a change serialises with checkout and with
 * `replaceProductVariants`, which locks the product, then the same rows: an
 * adjustment that waits on a variant that request deletes then finds no row
 * and answers 404.
 */

export type StockRow = { variantId: string; onHand: number; reserved: number; version: number }

export type MovementRow = {
  id: string
  kind: 'adjustment' | 'stocktake'
  onHandDelta: number
  reservedDelta: number
  reasonCode: string
  createdAt: Date
}

export type StockChange = { stock: StockRow; movement: MovementRow }

type UpdateSql = { sql: string; bindings: (string | number)[] }

async function runUpdate(trx: TransactionClientContract, update: UpdateSql) {
  const result = await trx.rawQuery(update.sql, update.bindings)
  const row = (result.rows as Record<string, number | string>[])[0]
  return row
    ? {
        variantId: row.variant_id as string,
        onHand: row.on_hand as number,
        reserved: row.reserved as number,
        version: row.version as number,
      }
    : null
}

/*
 * The lock, then the guarded update (above). `refusal` names what the
 * locked row refuses; the guard and it must agree, so an update that
 * changes nothing on a row `refusal` accepts is a bug.
 */
export async function guardedStockUpdate(
  trx: TransactionClientContract,
  scope: { shopId: string; variantId: string },
  update: UpdateSql,
  refusal: (row: { onHand: number; reserved: number }) => Promise<DomainError | null>
): Promise<{ before: { onHand: number }; after: StockRow }> {
  const current = await trx
    .from('inventory_items')
    .where({ variant_id: scope.variantId, shop_id: scope.shopId })
    .select('on_hand', 'reserved')
    .forUpdate()
    .first()
  if (!current) throw new DomainError('NOT_FOUND')
  const updated = await runUpdate(trx, update)
  if (updated) return { before: { onHand: current.on_hand }, after: updated }
  const reason = await refusal({ onHand: current.on_hand, reserved: current.reserved })
  if (reason) throw reason
  throw new InvariantViolation('a stock update refused a row its refusal check accepts')
}

/*
 * The 409 `below_reserved` (docs/05 §8.13, 06 §5.1, AC-FR-INV-003-2): the
 * current `on_hand` and `reserved`, split into `reserved_committed` with
 * the shop orders the vendor can act on and `reserved_held`, a count only.
 */
export async function belowReserved(
  trx: TransactionClientContract,
  scope: { shopId: string; variantId: string },
  field: string,
  row: { onHand: number; reserved: number }
): Promise<DomainError> {
  const split = await reservedSplit(trx, scope.shopId, scope.variantId)
  const units = (count: number) => `${count} reserved ${count === 1 ? 'unit' : 'units'}`
  const item: ProblemErrorItem = {
    field,
    code: 'below_reserved',
    message:
      row.reserved === 0
        ? `On hand is ${row.onHand}, and it cannot go below zero.`
        : `On hand cannot go below the ${units(row.reserved)}.`,
    on_hand: row.onHand,
    reserved: row.reserved,
    reserved_committed: split.committed,
    committed_shop_orders: split.committedShopOrders,
    reserved_held: split.held,
  }
  return new DomainError('CONFLICT', {
    detail:
      row.reserved === 0
        ? 'This change would take stock below zero.'
        : 'This change would leave less stock than is reserved for orders.',
    errors: [item],
  })
}

/*
 * The movement, the audit row and the listing refresh of a vendor's stock
 * change, after the update. The movement references the idempotency key
 * row (`reference_type = 'request'`, docs/04a §8.3); the audit row records
 * `on_hand` from and to and the reason, never the note, which a vendor may
 * fill with anything (04a §15.3 "No personal values").
 */
export async function recordVendorChange(
  trx: TransactionClientContract,
  change: {
    shopId: string
    keyId: string | null
    kind: 'adjustment' | 'stocktake'
    onHandDelta: number
    reasonCode: string
    note: string | null
    before: { onHand: number }
    after: StockRow
  },
  actor: Actor
): Promise<StockChange> {
  if (!change.keyId) throw new InvariantViolation('a vendor stock change needs its key row')
  // The ID as the database returned it, lower case whatever the path's spelling.
  const variantId = change.after.variantId
  const [movement] = await trx
    .table('inventory_movements')
    .insert({
      shop_id: change.shopId,
      variant_id: variantId,
      kind: change.kind,
      on_hand_delta: change.onHandDelta,
      reserved_delta: 0,
      reason_code: change.reasonCode,
      note: change.note,
      actor_user_id: actor.userId,
      reference_type: 'request',
      reference_id: change.keyId,
      request_id: actor.requestId,
    })
    .returning(['id', 'created_at'])
  await recordAudit(trx, {
    actorType: actor.type,
    actorUserId: actor.userId,
    actorRole: actor.role,
    requestId: actor.requestId,
    ipHash: actor.ipHash ?? null,
    action: change.kind === 'adjustment' ? 'inventory.adjust' : 'inventory.stocktake',
    subjectType: 'inventory_item',
    subjectId: variantId,
    shopId: change.shopId,
    changes: {
      on_hand: { from: change.before.onHand, to: change.after.onHand },
      reason_code: change.reasonCode,
      movement_id: movement.id,
    },
  })
  // `in_stock` on the listing may change (docs/05 §5.9); a count that confirmed the number changes nothing.
  if (change.onHandDelta !== 0) {
    const variant = await trx
      .from('product_variants')
      .where({ id: variantId, shop_id: change.shopId })
      .select('product_id')
      .firstOrFail()
    await sendJob(trx, 'catalog.refresh_listing', {
      product_id: variant.product_id,
      request_id: actor.requestId,
      causation_id: null,
    })
  }
  return {
    stock: change.after,
    movement: {
      id: movement.id,
      kind: change.kind,
      onHandDelta: change.onHandDelta,
      reservedDelta: 0,
      reasonCode: change.reasonCode,
      createdAt: movement.created_at,
    },
  }
}

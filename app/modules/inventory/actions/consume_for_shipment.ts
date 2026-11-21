import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/*
 * The stock effect of a shipment's hand-over (docs/05 §5.6; the manual
 * `shipped` and the courier pickup, §6.3): for every line the parcel
 * carries, the one `committed` reservation of its kept quantity becomes
 * `consumed`, and the stock row gives up those units from both `on_hand` and
 * `reserved`, with one `ship` movement per variant. A `held` reservation is
 * never consumed (T-FUL-002). Locks follow docs/05 §4.4: `inventory_items`
 * in `variant_id` order (level 7), then the reservations in `id` order (8).
 *
 * Returns the lines that could not be consumed instead of throwing, so the
 * caller decides: the courier has the parcel already, so nothing is undone.
 */

export type ShipmentLine = { orderItemId: string; quantity: number }

export type ConsumeProblem = {
  orderItemId: string
  reason: 'no_committed_reservation' | 'quantity_mismatch' | 'stock_short'
}

export async function consumeForShipment(
  trx: TransactionClientContract,
  command: { shopId: string; shipmentId: string; lines: ShipmentLine[]; requestId: string | null }
): Promise<ConsumeProblem[]> {
  const problems: ConsumeProblem[] = []
  if (command.lines.length === 0) return problems
  const reservations = await trx
    .from('inventory_reservations')
    .where('shop_id', command.shopId)
    .whereIn(
      'order_item_id',
      command.lines.map((line) => line.orderItemId)
    )
    .where('status', 'committed')
    .orderBy('id', 'asc')
    .select('id', 'order_item_id', 'variant_id', 'quantity')
  const byItem = new Map(reservations.map((row) => [row.order_item_id as string, row]))
  const consumable: { id: string; variantId: string; quantity: number }[] = []
  for (const line of command.lines) {
    const reservation = byItem.get(line.orderItemId)
    if (!reservation)
      problems.push({ orderItemId: line.orderItemId, reason: 'no_committed_reservation' })
    else if (Number(reservation.quantity) !== line.quantity) {
      problems.push({ orderItemId: line.orderItemId, reason: 'quantity_mismatch' })
    } else
      consumable.push({
        id: reservation.id,
        variantId: reservation.variant_id,
        quantity: line.quantity,
      })
  }
  if (problems.length > 0) return problems

  const perVariant = new Map<string, number>()
  for (const row of consumable)
    perVariant.set(row.variantId, (perVariant.get(row.variantId) ?? 0) + row.quantity)
  for (const variantId of [...perVariant.keys()].sort()) {
    const quantity = perVariant.get(variantId)!
    const updated = await trx.rawQuery(
      `UPDATE inventory_items SET on_hand = on_hand - ?, reserved = reserved - ?, version = version + 1,
         updated_at = now()
       WHERE variant_id = ? AND shop_id = ? AND reserved >= ? AND on_hand >= ?
       RETURNING on_hand, reserved`,
      [quantity, quantity, variantId, command.shopId, quantity, quantity]
    )
    if (updated.rows.length !== 1) {
      problems.push(
        ...consumable
          .filter((row) => row.variantId === variantId)
          .map((row) => ({
            orderItemId: reservations.find((r) => r.id === row.id)!.order_item_id as string,
            reason: 'stock_short' as const,
          }))
      )
      return problems
    }
    await trx.table('inventory_movements').insert({
      shop_id: command.shopId,
      variant_id: variantId,
      kind: 'ship',
      on_hand_delta: -quantity,
      reserved_delta: -quantity,
      reason_code: 'shipment_handover',
      reference_type: 'shipment',
      reference_id: command.shipmentId,
      request_id: command.requestId,
    })
  }
  for (const row of consumable) {
    await trx
      .from('inventory_reservations')
      .where({ id: row.id, status: 'committed' })
      .update({ status: 'consumed', resolved_at: trx.raw('now()'), updated_at: trx.raw('now()') })
  }
  return problems
}

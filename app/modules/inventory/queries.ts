import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/*
 * The inventory module's reads (docs/09 §2.2; R1-S part 2a). Stock is
 * shop-confidential: `on_hand` appears only in seller views (docs/04a §8.1).
 */

// `on_hand` per variant of the shop; a variant without a row is absent. Pool by default.
export async function onHandOf(
  shopId: string,
  variantIds: readonly string[],
  client: QueryClientContract = db.connection()
): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map()
  const rows: { variant_id: string; on_hand: number }[] = await client
    .from('inventory_items')
    .where('shop_id', shopId)
    .whereIn('variant_id', [...variantIds])
    .select('variant_id', 'on_hand')
  return new Map(rows.map((row) => [row.variant_id, row.on_hand]))
}

/*
 * The variants among `variantIds` that have history: an inventory movement
 * (`inventory_movements_variant_history_idx`) or an order line
 * (`order_items_variant_idx`). Such a variant is archived, never deleted,
 * keeps its options, and fixes its product's axes (docs/04a §7.8, §7.9).
 * The caller has locked the variants' stock rows, so a concurrent stock
 * adjustment either committed first and shows here, or waits.
 */
export async function variantsWithHistory(
  client: QueryClientContract,
  variantIds: readonly string[]
): Promise<Set<string>> {
  if (variantIds.length === 0) return new Set()
  const ids = [...variantIds]
  const result = await client.rawQuery(
    `SELECT DISTINCT variant_id FROM inventory_movements WHERE variant_id = ANY(?::uuid[])
     UNION
     SELECT DISTINCT variant_id FROM order_items WHERE variant_id = ANY(?::uuid[])`,
    [ids, ids]
  )
  return new Set((result.rows as { variant_id: string }[]).map((row) => row.variant_id))
}

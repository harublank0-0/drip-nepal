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

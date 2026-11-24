import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { InvariantViolation } from '#exceptions/programming_errors'

/*
 * Stock rows around `replaceProductVariants` (docs/04a §7.9, §8.1; R1-S
 * part 2b).
 *
 * - `lockInventoryItems`: the variants' stock rows `FOR UPDATE`, in
 *   `variant_id` order (level 7 of docs/05 §4.4), before the history check,
 *   so a concurrent stock adjustment either commits first, and its variant
 *   is archived instead of deleted, or waits for the delete.
 * - `deleteInventoryItems`: removes the stock rows of variants that are
 *   deleted because they were never stocked or ordered. Such a row holds no
 *   stock and no reservation; one that does is a programming error.
 */
export async function lockInventoryItems(
  trx: TransactionClientContract,
  shopId: string,
  variantIds: readonly string[]
) {
  if (variantIds.length === 0) return
  await trx
    .from('inventory_items')
    .where('shop_id', shopId)
    .whereIn('variant_id', [...variantIds])
    .orderBy('variant_id')
    .forUpdate()
    .select('variant_id')
}

export async function deleteInventoryItems(
  trx: TransactionClientContract,
  shopId: string,
  variantIds: readonly string[]
) {
  if (variantIds.length === 0) return
  const deleted: { on_hand: number; reserved: number }[] = await trx
    .from('inventory_items')
    .where('shop_id', shopId)
    .whereIn('variant_id', [...variantIds])
    .delete()
    .returning(['on_hand', 'reserved'])
  if (deleted.some((row) => row.on_hand !== 0 || row.reserved !== 0)) {
    throw new InvariantViolation('a stock row with stock was about to be deleted')
  }
}

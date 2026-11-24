import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/*
 * A new variant's stock row, in the transaction that creates the variant
 * (docs/04a §8.1, docs/05 §5.1; docs/09 §12.8). `on_hand`, `reserved` and
 * `version` take their defaults (0, 0, 1), and no movement is written:
 * initial stock is a `received_stock` adjustment later.
 * `inventory_items_variant_fkey (variant_id, shop_id)` refuses a shop that
 * does not own the variant.
 */
export async function openInventoryItems(
  trx: TransactionClientContract,
  shopId: string,
  variantIds: readonly string[]
) {
  if (variantIds.length === 0) return
  await trx
    .table('inventory_items')
    .multiInsert(variantIds.map((variantId) => ({ variant_id: variantId, shop_id: shopId })))
}

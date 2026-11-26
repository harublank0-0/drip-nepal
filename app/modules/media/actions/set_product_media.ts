import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/*
 * The media module's half of `replaceProductMedia` (docs/06 §13.5, 04a
 * §7.14; R1-S part 2d-iii): replaces a product's gallery inside the
 * caller's transaction. `catalog` owns the product and checks the request
 * (the product locked in its shop, the assets `ready` product images of
 * that shop, positions 1 to n, the colours the product's own); this writes
 * `product_media`, which `media` owns (03 §4.1: catalog calls media's
 * actions when a product's image list changes).
 *
 * The whole set is deleted and inserted again, so reordering never swaps
 * two positions under `product_media_position_key`. The composite keys are
 * the database's half: an asset of another shop or another kind gives
 * 23503 (T-MED-101, T-MED-102), which the caller's checks make unreachable.
 */
export type ProductMediaItem = {
  mediaAssetId: string
  position: number
  altText: string | null
  colorValueId: string | null
}

export async function setProductMedia(
  trx: TransactionClientContract,
  target: { shopId: string; productId: string },
  items: ProductMediaItem[]
) {
  await trx
    .from('product_media')
    .where({ product_id: target.productId, shop_id: target.shopId })
    .delete()
  if (items.length === 0) return
  await trx.table('product_media').insert(
    items.map((item) => ({
      product_id: target.productId,
      shop_id: target.shopId,
      media_asset_id: item.mediaAssetId,
      position: item.position,
      alt_text: item.altText,
      color_value_id: item.colorValueId,
    }))
  )
}

import { InvariantViolation } from '#exceptions/programming_errors'
import { jobTx } from '#modules/platform/tx'

/*
 * `catalog.refresh_listing` (docs/03 §9, docs/04a §7.12): recomputes one
 * product's `product_listings` row from the source tables. A product is
 * visible when it is `published`, its shop `active`, it has a `ready` image
 * and an active variant (04a §7.12); a product that is not visible loses
 * its row. Each run rewrites from the source tables, so duplicates and
 * replays are harmless (05 §4.7), and a product that no longer exists
 * leaves nothing to do.
 *
 * R1-S builds this in two steps. Part 2a (this) handles every product that
 * is not visible, which is every product until images and publishing exist
 * (parts 2d and 2e). The row of a visible product is built with publishing
 * in part 2e; until then such a product cannot arise, and the job fails
 * loudly rather than leave a stale row.
 */
export async function refreshListing(payload: { product_id: string }) {
  return jobTx(async (trx) => {
    const result = await trx.rawQuery(
      `SELECT (p.status = 'published' AND s.status = 'active'
               AND EXISTS (SELECT 1 FROM product_media m
                             JOIN media_assets a ON a.id = m.media_asset_id
                            WHERE m.product_id = p.id AND a.status = 'ready')
               AND EXISTS (SELECT 1 FROM product_variants v
                            WHERE v.product_id = p.id AND v.status = 'active')) AS visible
         FROM products p JOIN shops s ON s.id = p.shop_id
        WHERE p.id = ?`,
      [payload.product_id]
    )
    const row: { visible: boolean } | undefined = result.rows[0]
    if (row?.visible) {
      throw new InvariantViolation('a visible product needs its listing row (R1-S part 2e)')
    }
    const removed = await trx
      .from('product_listings')
      .where('product_id', payload.product_id)
      .delete()
    return { outcome: row ? 'not_visible' : 'no_product', removed }
  })
}

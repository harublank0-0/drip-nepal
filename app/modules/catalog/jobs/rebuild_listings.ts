import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { refreshProductListing } from '#modules/catalog/jobs/refresh_listing'
import { jobTx } from '#modules/platform/tx'

/*
 * `catalog.rebuild_listings` (docs/03 §9, docs/04a §7.12, ADR-0014; R1-S
 * part 2e-i), daily at 03:30 Asia/Kathmandu: the full recompute that
 * catches anything a missed or failed `catalog.refresh_listing` left
 * behind. It refreshes every product that is `published` or still has a
 * row, so a product that should be listed gains its row and one that
 * should not loses it, each in its own short transaction with the same
 * code as the per-product job. A product's failure is logged and the run
 * goes on; the run then fails (2 retries, then `dlq.catalog.rebuild_listings`,
 * whose letters the next night makes redundant).
 */
export async function rebuildListings(requestId: string | null) {
  const rows: { id: string }[] = await db
    .from('products')
    .where('status', 'published')
    .union((query) => query.from('product_listings').select('product_id as id'))
    .select('id')
  const counts = { listed: 0, not_visible: 0, no_product: 0, failed: 0 }
  let lastError: unknown = null
  for (const row of rows) {
    try {
      counts[await jobTx((trx) => refreshProductListing(trx, row.id))] += 1
    } catch (error) {
      counts.failed += 1
      lastError = error
      const failure = error as { name?: string; code?: string; constraint?: string }
      logger.warn(
        {
          product_id: row.id,
          error: failure.name,
          code: failure.code,
          constraint: failure.constraint,
          request_id: requestId,
        },
        'catalog.rebuild_listing_failed'
      )
    }
  }
  logger.info({ ...counts, request_id: requestId }, 'catalog.rebuild_listings')
  if (lastError) throw lastError
  return counts
}

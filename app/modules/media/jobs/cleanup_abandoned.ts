import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { finalKey } from '#modules/media/domain/media_keys'
import { ObjectStorage } from '#modules/platform/ports/object_storage'
import { jobTx } from '#modules/platform/tx'

/*
 * `media.cleanup_abandoned` (docs/03 §9, ADR-0013 decision 6, 04a §7.13;
 * R1-S part 2d-ii), daily at 02:45 Asia/Kathmandu: an upload never finished
 * (`pending_upload`) or `rejected`, created more than 24 hours ago, loses
 * its objects in the private bucket (the upload key and, for a `rejected`
 * asset, the final key an attempt that later failed may have written) and
 * becomes `deleted`, the
 * row kept as a tombstone. For each asset, oldest first, the objects are
 * deleted outside any transaction, then a compare-and-set on the status it
 * was read with marks it, so an asset finished meanwhile is left alone.
 * Deleting twice is harmless. An asset whose delete fails is skipped and
 * the run goes on, so one bad object cannot stop the rest; the run then
 * fails (3 retries, then `dlq.media.cleanup_abandoned`, whose letters the
 * next run makes redundant) and the next run tries it again. A run deletes
 * at most `CLEANUP_LIMIT` assets and logs how many it left.
 *
 * Not deleted here: public derivatives an attempt wrote before a rejection
 * (content-addressed by the original's SHA-256, so their keys cannot be
 * guessed, and without metadata), and an object PUT to the upload key of a
 * `ready` asset after the worker deleted it (03 §7.5, 07 TM-15 Residual).
 */
export const CLEANUP_BATCH = 100
export const CLEANUP_LIMIT = 1000

export async function cleanupAbandoned(requestId: string | null): Promise<{ deleted: number }> {
  const storage = await app.container.make(ObjectStorage)
  const ctx = { requestId, timeoutMs: 10_000 }
  let deleted = 0
  let failed = 0
  let lastError: unknown = null
  const seen = new Set<string>()
  while (deleted < CLEANUP_LIMIT) {
    const rows = await db
      .from('media_assets')
      .whereIn('status', ['pending_upload', 'rejected'])
      .whereRaw(`created_at < now() - interval '24 hours'`)
      .whereNotIn('id', [...seen])
      .orderBy('created_at')
      .limit(Math.min(CLEANUP_BATCH, CLEANUP_LIMIT - deleted))
      .select('id', 'shop_id', 'status', 'original_key')
    if (rows.length === 0) break
    for (const row of rows) {
      seen.add(row.id)
      try {
        await storage.delete('private', row.original_key, ctx)
        // Only a `rejected` asset, which is final: a `pending_upload` one has had no worker run,
        // and may be finished and processed while this run goes, its final key then live.
        if (row.status === 'rejected') {
          await storage.delete('private', finalKey(row.shop_id, row.id), ctx)
        }
      } catch (error) {
        failed += 1
        lastError = error
        logger.warn(
          { media_asset_id: row.id, error: (error as Error).name },
          'media.cleanup_object_not_deleted'
        )
        continue
      }
      const marked = await jobTx((trx) =>
        trx
          .from('media_assets')
          .where({ id: row.id, status: row.status })
          .update({ status: 'deleted' })
          .returning('id')
      )
      deleted += marked.length
    }
  }
  const left = await db
    .from('media_assets')
    .whereIn('status', ['pending_upload', 'rejected'])
    .whereRaw(`created_at < now() - interval '24 hours'`)
    .count('* as count')
    .first()
  logger.info({ deleted, failed, left: Number(left?.count ?? 0) }, 'media.cleanup_abandoned')
  if (lastError) throw lastError
  return { deleted }
}

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { ObjectStorage } from '#modules/platform/ports/object_storage'
import { jobTx } from '#modules/platform/tx'

/*
 * `media.cleanup_abandoned` (docs/03 §9, ADR-0013 decision 6, 04a §7.13;
 * R1-S part 2d-ii), daily at 02:45 Asia/Kathmandu: an upload never finished
 * (`pending_upload`) or `rejected`, created more than 24 hours ago, loses
 * its object in the private bucket and becomes `deleted`, the row kept as
 * a tombstone. For each asset, oldest first, the object is deleted outside
 * any transaction, then a compare-and-set on the status it was read with
 * marks it, so an asset finished meanwhile is left alone. Deleting twice is
 * harmless, so a run stopped halfway, or by a store outage (which fails the
 * job: 3 retries, then `dlq.media.cleanup_abandoned`, whose letters the next
 * run makes redundant), is repeated by the next one. A run handles at most
 * `CLEANUP_LIMIT` assets and logs how many it left for the next run.
 *
 * Not deleted here: derived public images (none exist for these statuses),
 * and an object PUT to the upload key of a `ready` asset after the worker
 * deleted it (03 §7.5, 07 TM-15 Residual).
 */
export const CLEANUP_BATCH = 100
export const CLEANUP_LIMIT = 1000

export async function cleanupAbandoned(requestId: string | null): Promise<{ deleted: number }> {
  const storage = await app.container.make(ObjectStorage)
  const ctx = { requestId, timeoutMs: 10_000 }
  let deleted = 0
  const seen = new Set<string>()
  while (deleted < CLEANUP_LIMIT) {
    const rows = await db
      .from('media_assets')
      .whereIn('status', ['pending_upload', 'rejected'])
      .whereRaw(`created_at < now() - interval '24 hours'`)
      .whereNotIn('id', [...seen])
      .orderBy('created_at')
      .limit(Math.min(CLEANUP_BATCH, CLEANUP_LIMIT - deleted))
      .select('id', 'status', 'original_key')
    if (rows.length === 0) break
    for (const row of rows) {
      seen.add(row.id)
      await storage.delete('private', row.original_key, ctx)
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
  logger.info({ deleted, left: Number(left?.count ?? 0) }, 'media.cleanup_abandoned')
  return { deleted }
}

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { DomainError, InvalidStateTransition } from '#exceptions/domain_error'
import type { MediaKind } from '#modules/media/domain/media_kind'
import { MEDIA_MAX_BYTES } from '#modules/media/domain/media_limits'
import { mediaAssetRow, shopMediaAsset, type MediaAssetRow } from '#modules/media/queries'
import type { Actor } from '#modules/platform/actor'
import { sendJob } from '#modules/platform/jobs'
import { ObjectStorage, type StoredObject } from '#modules/platform/ports/object_storage'
import { withTx } from '#modules/platform/tx'

/*
 * `completeMediaUpload` (docs/06 §13.5; 03 §7.5; ADR-0013 decision 2; 07
 * TM-15, TM-16; R1-S part 2d-i):
 *
 * 1. the asset is loaded inside the shop (another shop's is 404, T-SEC-001),
 *    then `authorize` applies its kind's permission and status gate
 *    (`mediaByKind`, 07 §4.8); an asset no longer `pending_upload` is 409
 *    `INVALID_STATE_TRANSITION`;
 * 2. a `HEAD` of the upload key, outside any transaction (03 §8.3): no
 *    object is 409 `CONFLICT` (`upload_missing`) and writes nothing, so the
 *    seller can PUT again while the URL lasts and finish once more;
 * 3. one short transaction, a compare-and-set from `pending_upload`:
 *    - the object is as declared: `processing`, with its ETag and size
 *      (`upload_etag`, `upload_bytes`, so the worker reads exactly this
 *      object, 04a §7.13), and `media.process_upload` sent in the same
 *      transaction (ADR-0010); 202;
 *    - the object is empty, above 10 MB, of another `Content-Type` than the
 *      declared mime, or has an ETag the column cannot hold: `rejected`
 *      with a reason the seller sees, and the object is deleted after the
 *      commit (best effort; `media.cleanup_abandoned` removes what is
 *      left, part 2d-ii); 200 with the rejected asset.
 *    A compare-and-set that matches nothing (finished meanwhile) is 409.
 */
export type CompleteMediaUploadCommand = { shopId: string; mediaAssetId: string }

function refusalOf(asset: MediaAssetRow, stored: StoredObject): string | null {
  if (stored.bytes < 1) return 'The file is empty.'
  if (stored.bytes > MEDIA_MAX_BYTES) return 'The file is larger than 10 MB.'
  if (stored.contentType !== asset.mime) return 'The file type does not match the type declared.'
  if (stored.etag.length < 1 || stored.etag.length > 128) return 'The file could not be checked.'
  return null
}

export async function completeMediaUpload(
  command: CompleteMediaUploadCommand,
  context: { actor: Actor; authorize: (kind: MediaKind) => void }
): Promise<MediaAssetRow> {
  const asset = await shopMediaAsset(db.connection(), command.shopId, command.mediaAssetId)
  if (!asset) throw new DomainError('NOT_FOUND')
  context.authorize(asset.kind)
  if (asset.status !== 'pending_upload') throw new InvalidStateTransition(asset.status, [])

  const storage = await app.container.make(ObjectStorage)
  const ctx = { requestId: context.actor.requestId, timeoutMs: 5000 }
  const stored = await storage.head('private', asset.originalKey, ctx)
  if (!stored) {
    throw new DomainError('CONFLICT', {
      detail: 'The file has not arrived. Upload it again, then finish.',
      errors: [{ field: null, code: 'upload_missing', message: 'No file was uploaded.' }],
    })
  }
  const refusal = refusalOf(asset, stored)

  const updated = await withTx(async (trx) => {
    const scope = { id: asset.id, shop_id: asset.shopId, status: 'pending_upload' }
    const [row] = refusal
      ? await trx
          .from('media_assets')
          .where(scope)
          .update({ status: 'rejected', rejection_reason: refusal })
          .returning('*')
      : await trx
          .from('media_assets')
          .where(scope)
          .update({ status: 'processing', upload_etag: stored.etag, upload_bytes: stored.bytes })
          .returning('*')
    if (!row) {
      const current = await shopMediaAsset(trx, asset.shopId, asset.id)
      throw new InvalidStateTransition(current?.status ?? asset.status, [])
    }
    if (!refusal) {
      await sendJob(trx, 'media.process_upload', {
        media_asset_id: asset.id,
        request_id: context.actor.requestId,
        causation_id: null,
      })
    }
    return mediaAssetRow(row)
  })

  if (refusal) {
    await storage.delete('private', asset.originalKey, ctx).catch((error: unknown) => {
      logger.warn(
        { media_asset_id: asset.id, error: (error as Error).name },
        'media.rejected_upload_not_deleted'
      )
    })
  }
  return updated
}

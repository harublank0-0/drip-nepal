import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { uploadKey } from '#modules/media/domain/media_keys'
import { UPLOAD_URL_SECONDS, type ImageMimeType } from '#modules/media/domain/media_limits'
import { mediaAssetRow, type MediaAssetRow } from '#modules/media/queries'
import type { Actor } from '#modules/platform/actor'
import { ObjectStorage, type PresignedUpload } from '#modules/platform/ports/object_storage'
import { rateLimiter, rateLimitKey } from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'

/*
 * `createMediaUpload` (docs/06 §13.5; 03 §7.5; ADR-0013 decision 2; 01
 * FR-MED-001; R1-S part 2d-i). The controller has checked the kind's
 * permission and status gate (`mediaByKind`, 07 §4.8) and validated the
 * kind, the mime and the declared size. Then:
 *
 * 1. the `media_upload` limiter, 120 per hour per shop, whoever uploads
 *    (06 §9.1): past it, 429 `RATE_LIMITED` and nothing is written;
 * 2. a new UUIDv7 and a presigned PUT for the upload key
 *    `originals/<shop_id>/<id>` in the private bucket, valid 10 minutes,
 *    with the mime bound into the signature (07 TM-16). Signing is local,
 *    and it comes before the insert, so a store that cannot sign (503)
 *    leaves no row behind;
 * 3. the `media_assets` row, `pending_upload`, in one short transaction.
 *
 * No audit row: an upload changes nothing a buyer sees until the product
 * uses it (`replaceProductMedia`, part 2d-iii).
 */
export type CreateMediaUploadCommand = {
  shopId: string
  kind: 'product_image'
  mime: ImageMimeType
  bytes: number
}

export type MediaUpload = { asset: MediaAssetRow; upload: PresignedUpload; expiresAt: Date }

export async function createMediaUpload(
  command: CreateMediaUploadCommand,
  context: { actor: Actor }
): Promise<MediaUpload> {
  await rateLimiter('media_upload').consume(rateLimitKey('media_upload', command.shopId))
  const result = await db.rawQuery('SELECT uuidv7() AS id')
  const id = (result.rows as { id: string }[])[0].id
  const key = uploadKey(command.shopId, id)
  const storage = await app.container.make(ObjectStorage)
  const upload = await storage.presignUpload(
    'private',
    key,
    { contentType: command.mime, expiresInSeconds: UPLOAD_URL_SECONDS },
    { requestId: context.actor.requestId, timeoutMs: 5000 }
  )
  const expiresAt = new Date(Date.now() + UPLOAD_URL_SECONDS * 1000)
  const asset = await withTx(async (trx) => {
    const [row] = await trx
      .table('media_assets')
      .insert({
        id,
        shop_id: command.shopId,
        kind: command.kind,
        mime: command.mime,
        bytes: command.bytes,
        original_key: key,
        uploaded_by: context.actor.userId,
      })
      .returning('*')
    return mediaAssetRow(row)
  })
  return { asset, upload, expiresAt }
}

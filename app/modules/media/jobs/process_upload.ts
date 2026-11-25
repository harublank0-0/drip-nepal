import { createHash } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { sniffImageType } from '#modules/media/domain/magic_bytes'
import { derivedKey, finalKey, uploadKey } from '#modules/media/domain/media_keys'
import {
  DERIVED_CACHE_CONTROL,
  MAX_IMAGE_PIXELS,
  MAX_INTERLACED_PIXELS,
  MEDIA_MAX_BYTES,
  derivedWidthsFor,
} from '#modules/media/domain/media_limits'
import {
  sharpImageCodec,
  type Derivative,
  type ImageCodec,
  type ImageInspection,
} from '#modules/media/internal/image_codec'
import { sendJob, type JobEnvelope, type JobPayloads } from '#modules/platform/jobs'
import type { CallContext } from '#modules/platform/ports/call_context'
import { ObjectStorage } from '#modules/platform/ports/object_storage'
import { jobTx } from '#modules/platform/tx'

/*
 * `media.process_upload` (docs/03 §7.5 and §9, ADR-0013 decision 3, 07
 * TM-15; R1-S part 2d-ii): validates one uploaded original and writes its
 * derivatives. The steps, in order:
 *
 * 1. The asset must be `processing`; anything else was finished by an
 *    earlier run, so the job ends. A `ready` asset's upload key is deleted
 *    once more, in case a crash came between that run's commit and its
 *    delete.
 * 2. The upload key is read with `If-Match` on `upload_etag` and at most
 *    10 MB, so the bytes are exactly those `completeMediaUpload` checked by
 *    `HEAD`: an object missing, changed since or too large is rejected.
 * 3. The magic bytes must be JPEG, PNG or WebP and match the declared mime,
 *    before sharp sees anything; then sharp reads the header: at most 40
 *    megapixels, at most 12 if interlaced, of the declared format.
 * 4. sharp decodes and writes the WebP derivatives; an image it cannot
 *    decode is rejected.
 * 5. Outside any transaction: the derivatives go to the public bucket under
 *    content-addressed keys, and the bytes read in step 2 to the final key
 *    in the private bucket. A store failure throws, and pg-boss retries
 *    (3 times from 30 s, then `dlq.media.process_upload`, 11 §8.2); every
 *    write is to the same key with the same bytes, so a retry repeats it
 *    harmlessly.
 * 6. One transaction: compare-and-set `processing` → `ready` with the final
 *    key, `derived_keys`, `width` and `height`, `sha256` and `processed_at`; and
 *    `media.ready`, which is `catalog.refresh_listing` for each product that
 *    shows the asset (03 §4.1; none yet in R1-S, since `replaceProductMedia`
 *    takes only `ready` assets).
 * 7. After the commit, the upload key is deleted, so a run retried after a
 *    crash before the commit can still read it.
 *
 * A rejection is a compare-and-set to `rejected` with a reason the seller
 * reads, then the upload key is deleted, and the final key too, which an
 * earlier attempt may have written before failing (best effort;
 * `media.cleanup_abandoned` deletes both again later). sharp is loaded
 * before anything is read, outside the checks, so a sharp that cannot load
 * throws and the job is retried rather than rejecting a valid image. Logs
 * carry the asset ID and a reason code, never a key or the file's contents
 * (09 §7.2).
 */
type Payload = JobPayloads['media.process_upload'] & JobEnvelope

export const REJECTIONS = {
  missing: 'The file is no longer there. Upload it again.',
  changed: 'The file changed after it was checked. Upload it again.',
  too_large: 'The file is larger than 10 MB.',
  not_image: 'The file is not a JPEG, PNG or WebP image.',
  wrong_type: 'The file is not of the type declared when the upload started.',
  too_many_pixels: 'The image is larger than 40 megapixels.',
  interlaced: 'An interlaced image may be at most 12 megapixels. Save it without interlacing.',
  unreadable: 'The image could not be read. It may be damaged.',
} as const
export type RejectionCode = keyof typeof REJECTIONS

type Asset = {
  id: string
  shopId: string
  status: string
  mime: string
  originalKey: string
  uploadEtag: string | null
}

const FORMAT_OF_MIME: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
}

async function loadAsset(id: string): Promise<Asset | null> {
  const row = await db
    .from('media_assets')
    .where('id', id)
    .select('id', 'shop_id', 'status', 'mime', 'original_key', 'upload_etag')
    .first()
  if (!row) return null
  return {
    id: row.id,
    shopId: row.shop_id,
    status: row.status,
    mime: row.mime,
    originalKey: row.original_key,
    uploadEtag: row.upload_etag,
  }
}

async function deleteQuietly(storage: ObjectStorage, key: string, asset: Asset, ctx: CallContext) {
  await storage.delete('private', key, ctx).catch((error: unknown) => {
    logger.warn(
      { media_asset_id: asset.id, error: (error as Error).name },
      'media.upload_key_not_deleted'
    )
  })
}

// Steps 3 and 4: the checks before and with sharp, then the derivatives.
async function validate(
  bytes: Buffer,
  mime: string,
  codec: ImageCodec
): Promise<
  | { rejection: RejectionCode }
  | { inspection: ImageInspection; derivatives: Derivative[]; widths: number[] }
> {
  const sniffed = sniffImageType(bytes)
  if (!sniffed) return { rejection: 'not_image' }
  if (sniffed !== mime) return { rejection: 'wrong_type' }
  let inspection: ImageInspection
  try {
    inspection = await codec.inspect(bytes)
  } catch (error) {
    const pixels = /pixel limit/i.test((error as Error).message ?? '')
    return { rejection: pixels ? 'too_many_pixels' : 'unreadable' }
  }
  if (inspection.format !== FORMAT_OF_MIME[mime]) return { rejection: 'wrong_type' }
  const pixels = inspection.width * inspection.height
  if (pixels > MAX_IMAGE_PIXELS) return { rejection: 'too_many_pixels' }
  if (inspection.interlaced && pixels > MAX_INTERLACED_PIXELS) return { rejection: 'interlaced' }
  const widths = derivedWidthsFor(inspection.width)
  try {
    return { inspection, widths, derivatives: await codec.derive(bytes, widths) }
  } catch {
    return { rejection: 'unreadable' }
  }
}

async function reject(asset: Asset, code: RejectionCode, storage: ObjectStorage, ctx: CallContext) {
  const rejected = await jobTx((trx) =>
    trx
      .from('media_assets')
      .where({ id: asset.id, status: 'processing' })
      .update({
        status: 'rejected',
        rejection_reason: REJECTIONS[code],
        processed_at: trx.knexRawQuery('now()'),
      })
      .returning('id')
  )
  if (rejected.length === 0) return
  logger.info({ media_asset_id: asset.id, reason: code }, 'media.rejected')
  await deleteQuietly(storage, asset.originalKey, asset, ctx)
  await deleteQuietly(storage, finalKey(asset.shopId, asset.id), asset, ctx)
}

export async function processUpload(
  payload: Payload,
  options: { codec?: ImageCodec } = {}
): Promise<void> {
  const codec = options.codec ?? sharpImageCodec
  const asset = await loadAsset(payload.media_asset_id)
  if (!asset || asset.status === 'pending_upload' || asset.status === 'rejected') return
  const storage = await app.container.make(ObjectStorage)
  const ctx: CallContext = { requestId: payload.request_id, timeoutMs: 30_000 }
  // Step 1: a `ready` asset was processed; its upload key may have outlived a crash.
  if (asset.status !== 'processing') {
    if (asset.status === 'ready') {
      await deleteQuietly(storage, uploadKey(asset.shopId, asset.id), asset, ctx)
    }
    return
  }

  // A sharp that cannot load is an outage of the worker, not a bad file: it throws for a retry.
  await codec.load()

  // A `processing` row always has its ETag (`media_assets_upload_check`).
  const read = await storage.read(
    'private',
    asset.originalKey,
    { ifMatch: asset.uploadEtag ?? '', maxBytes: MEDIA_MAX_BYTES },
    ctx
  )
  if (read.outcome !== 'read') return reject(asset, read.outcome, storage, ctx)

  const checked = await validate(read.body, asset.mime, codec)
  if ('rejection' in checked) return reject(asset, checked.rejection, storage, ctx)

  const sha256 = createHash('sha256').update(read.body).digest()
  const derivedKeys: Record<string, string> = {}
  for (const derivative of checked.derivatives) {
    const key = derivedKey(asset.id, sha256.toString('hex'), derivative.width)
    await storage.put(
      'public',
      key,
      derivative.body,
      { contentType: 'image/webp', cacheControl: DERIVED_CACHE_CONTROL },
      ctx
    )
    derivedKeys[String(derivative.width)] = key
  }
  const final = finalKey(asset.shopId, asset.id)
  await storage.put('private', final, read.body, { contentType: asset.mime }, ctx)

  const ready = await jobTx(async (trx) => {
    const updated = await trx
      .from('media_assets')
      .where({ id: asset.id, status: 'processing' })
      .update({
        status: 'ready',
        original_key: final,
        derived_keys: JSON.stringify(derivedKeys),
        width: checked.inspection.width,
        height: checked.inspection.height,
        sha256,
        processed_at: trx.knexRawQuery('now()'),
      })
      .returning('id')
    if (updated.length === 0) return false
    // `media.ready` (03 §4.1): each product that shows the asset recomputes its listing row.
    const products = await trx
      .from('product_media')
      .where('media_asset_id', asset.id)
      .distinct('product_id')
    for (const product of products) {
      await sendJob(trx, 'catalog.refresh_listing', {
        product_id: product.product_id as string,
        request_id: payload.request_id,
        causation_id: null,
      })
    }
    return true
  })
  if (!ready) return
  logger.info({ media_asset_id: asset.id, widths: checked.widths.length }, 'media.ready')
  await deleteQuietly(storage, asset.originalKey, asset, ctx)
}

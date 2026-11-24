import type { MediaUpload } from '#modules/media/actions/create_media_upload'
import type { MediaAssetRow } from '#modules/media/queries'

/*
 * The seller views of an upload (docs/06 §13.5; `MediaUpload` and
 * `SellerMediaAsset` in openapi.yaml; R1-S part 2d-i). Never an object key
 * or a URL to a private object: the presigned URL is the only way in, and
 * it targets the one upload key for 10 minutes.
 */
export function mediaAssetJson(asset: MediaAssetRow) {
  return {
    id: asset.id,
    kind: asset.kind,
    status: asset.status,
    mime: asset.mime,
    bytes: asset.bytes,
    rejection_reason: asset.rejectionReason,
    created_at: asset.createdAt.toISOString(),
  }
}

export function mediaUploadJson(result: MediaUpload) {
  return {
    media_asset_id: result.asset.id,
    upload_url: result.upload.url,
    headers: result.upload.headers,
    expires_at: result.upload.expiresAt.toISOString(),
    asset: mediaAssetJson(result.asset),
  }
}

/*
 * Object keys (docs/03 §3.5, 04a §7.13). In the private bucket, the upload
 * key a presigned PUT targets is `originals/<shop_id>/<media_asset_id>`;
 * after validation the worker writes the bytes it checked to the final key
 * `…/v1`, which no presigned URL targets (07 TM-15). In the public bucket,
 * each derived WebP image is content-addressed by the original's SHA-256,
 * so a key never names two contents: `p/<media_asset_id>/<16 hex>-<width>.webp`.
 * IDs are UUIDv7, never file names (07 TM-16).
 */
export const uploadKey = (shopId: string, mediaAssetId: string) =>
  `originals/${shopId}/${mediaAssetId}`

export const finalKey = (shopId: string, mediaAssetId: string) =>
  `${uploadKey(shopId, mediaAssetId)}/v1`

export const derivedKey = (mediaAssetId: string, sha256Hex: string, width: number) =>
  `p/${mediaAssetId}/${sha256Hex.slice(0, 16)}-${width}.webp`

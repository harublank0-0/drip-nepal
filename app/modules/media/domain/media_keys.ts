/*
 * Object keys in the private bucket (docs/03 §3.5, 04a §7.13): the upload
 * key a presigned PUT targets is `originals/<shop_id>/<media_asset_id>`;
 * after validation the worker writes the bytes it checked to a final key
 * that no presigned URL targets (R1-S part 2d-ii). IDs are UUIDv7, never
 * file names (07 TM-16).
 */
export const uploadKey = (shopId: string, mediaAssetId: string) =>
  `originals/${shopId}/${mediaAssetId}`

/*
 * `media_assets.mime` (docs/04a §7.13): the values of
 * `media_assets_mime_check`, in its order. T-ARCH-011 fails if the two differ
 * (docs/04 §2.4). `application/pdf` only for `kyc_document`.
 */
export const MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const
export type MediaMimeType = (typeof MEDIA_MIME_TYPES)[number]

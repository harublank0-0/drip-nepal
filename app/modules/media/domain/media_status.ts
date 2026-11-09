/*
 * `media_assets.status` (docs/04a §7.13): the values of
 * `media_assets_status_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const MEDIA_STATUSES = [
  'pending_upload',
  'processing',
  'ready',
  'rejected',
  'deleted',
] as const
export type MediaStatus = (typeof MEDIA_STATUSES)[number]

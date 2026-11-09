/*
 * `media_assets.kind` (docs/04a §7.13): the values of
 * `media_assets_kind_check`, in its order. T-ARCH-011 fails if the two differ
 * (docs/04 §2.4). `product_media.media_kind` holds only `product_image`
 * (docs/04a §7.14).
 */
export const MEDIA_KINDS = ['product_image', 'shop_logo', 'shop_banner', 'kyc_document'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

/*
 * `shops.product_review_mode` (docs/04a §6.1): the values of
 * `shops_product_review_mode_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const PRODUCT_REVIEW_MODES = ['pre', 'post'] as const
export type ProductReviewMode = (typeof PRODUCT_REVIEW_MODES)[number]

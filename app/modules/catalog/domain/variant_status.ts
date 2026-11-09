/*
 * `product_variants.status` (docs/04a §7.9): the values of
 * `product_variants_status_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const VARIANT_STATUSES = ['active', 'archived'] as const
export type VariantStatus = (typeof VARIANT_STATUSES)[number]

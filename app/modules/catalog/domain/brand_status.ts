/*
 * `brands.status` (docs/04a §7.5): the values of `brands_status_check`, in
 * its order. T-ARCH-011 fails if the two differ (docs/04 §2.4).
 */
export const BRAND_STATUSES = ['active', 'pending', 'rejected'] as const
export type BrandStatus = (typeof BRAND_STATUSES)[number]

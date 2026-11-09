/*
 * `shops.business_type` (docs/04a §6.1): the values of
 * `shops_business_type_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const BUSINESS_TYPES = ['individual', 'registered_business'] as const
export type BusinessType = (typeof BUSINESS_TYPES)[number]

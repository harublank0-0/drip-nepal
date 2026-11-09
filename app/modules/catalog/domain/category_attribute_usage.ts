/*
 * `category_attributes.usage` (docs/04a §7.4): the values of
 * `category_attributes_usage_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const CATEGORY_ATTRIBUTE_USAGES = ['product', 'variant_axis'] as const
export type CategoryAttributeUsage = (typeof CATEGORY_ATTRIBUTE_USAGES)[number]

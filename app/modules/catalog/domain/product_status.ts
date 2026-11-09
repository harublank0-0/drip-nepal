/*
 * `products.status` (docs/04a §7.6): the values of `products_status_check`,
 * in its order. T-ARCH-011 fails if the two differ (docs/04 §2.4).
 * Transitions: docs/05 §6.
 */
export const PRODUCT_STATUSES = [
  'draft',
  'pending_review',
  'published',
  'unpublished',
  'rejected',
  'archived',
  'blocked',
] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

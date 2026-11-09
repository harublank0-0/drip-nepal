/*
 * `shops.status` (docs/04a §6.1): the values of `shops_status_check`, in its
 * order. T-ARCH-011 fails if the two differ (docs/04 §2.4). Transitions:
 * docs/05 §6.
 */
export const SHOP_STATUSES = [
  'pending_review',
  'active',
  'rejected',
  'suspended',
  'closed',
] as const
export type ShopStatus = (typeof SHOP_STATUSES)[number]

/*
 * `shop_orders.rejection_reason` (docs/04a §11.2): the values of
 * `shop_orders_rejection_reason_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const SHOP_ORDER_REJECTION_REASONS = [
  'out_of_stock',
  'cannot_fulfil',
  'pricing_error',
  'other',
] as const
export type ShopOrderRejectionReason = (typeof SHOP_ORDER_REJECTION_REASONS)[number]

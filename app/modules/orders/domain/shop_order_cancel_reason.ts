/*
 * `shop_orders.cancel_reason` (docs/04a §11.2): the values of
 * `shop_orders_cancel_reason_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const SHOP_ORDER_CANCEL_REASONS = [
  'customer_cancelled',
  'payment_expired',
  'acceptance_timeout',
  'admin_cancelled',
  'shop_frozen',
  'undeliverable',
  'stock_unavailable_after_payment',
] as const
export type ShopOrderCancelReason = (typeof SHOP_ORDER_CANCEL_REASONS)[number]

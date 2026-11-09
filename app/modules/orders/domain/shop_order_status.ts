/*
 * `shop_orders.status` (docs/04a §11.2): the values of
 * `shop_orders_status_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4). Transitions: docs/05 §6.
 */
export const SHOP_ORDER_STATUSES = [
  'awaiting_payment',
  'awaiting_acceptance',
  'accepted',
  'completed',
  'cancelled',
  'rejected',
] as const
export type ShopOrderStatus = (typeof SHOP_ORDER_STATUSES)[number]

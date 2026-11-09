/*
 * `orders.status` (docs/04a §11.1): the values of `orders_status_check`, in
 * its order. T-ARCH-011 fails if the two differ (docs/04 §2.4). Derived from
 * the shop orders: docs/05 §6.
 */
export const ORDER_STATUSES = [
  'awaiting_payment',
  'placed',
  'in_progress',
  'completed',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

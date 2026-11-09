/*
 * `carts.status` (docs/04a §10.1): the values of `carts_status_check`, in its
 * order. T-ARCH-011 fails if the two differ (docs/04 §2.4).
 */
export const CART_STATUSES = ['active', 'converted', 'abandoned', 'merged'] as const
export type CartStatus = (typeof CART_STATUSES)[number]

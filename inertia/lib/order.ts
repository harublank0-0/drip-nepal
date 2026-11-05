/*
 * Mirrors app/constants/order.ts, which the frontend can't import; it drives
 * the quantity stepper's upper bound. The delivery fee and threshold are in
 * shared/constants/delivery.ts, which both sides import.
 */
export const MAX_QUANTITY_PER_ITEM = 10

export const CART_ITEMS_URL = '/api/v1/cart/items'
export const CHECKOUT_URL = '/api/v1/checkout'

export function cancelOrderUrl(orderNumber: string) {
  return `/api/v1/account/orders/${encodeURIComponent(orderNumber)}/cancel`
}

export function trackCancelUrl(orderNumber: string) {
  return `/api/v1/track-order/${encodeURIComponent(orderNumber)}/cancel`
}

/*
 * Units that will actually be ordered: unavailable lines are listed in the
 * cart but left out of its totals.
 */
export function orderableQuantity(lines: { quantity: number; available: boolean }[]) {
  return lines.reduce((sum, line) => sum + (line.available ? line.quantity : 0), 0)
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

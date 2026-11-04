/*
 * Mirrors app/constants/order.ts, which the frontend can't import. The
 * server's cart and order totals are the source of truth; these only drive
 * hints (the free delivery nudge) and the quantity stepper's upper bound.
 */
export const FREE_SHIPPING_THRESHOLD = 5000
export const SHIPPING_FEE_PER_SHOP = 100
export const MAX_QUANTITY_PER_ITEM = 10

export const CART_ITEMS_URL = '/api/v1/cart/items'
export const CHECKOUT_URL = '/api/v1/checkout'

export function cancelOrderUrl(orderNumber: string) {
  return `/api/v1/account/orders/${encodeURIComponent(orderNumber)}/cancel`
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

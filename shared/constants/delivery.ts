/*
 * Delivery in v1, in paisa (docs/04 §18.1). Each shop ships its part of a
 * checkout separately, so the fee is per shop; a shop's part at or above
 * the threshold ships free. Shared by the server (what is charged) and the
 * pages (what is shown).
 */
export const SHIPPING_FEE_PER_SHOP_MINOR = 10_000 // Rs 100
export const FREE_SHIPPING_THRESHOLD_MINOR = 500_000 // Rs 5,000

export function shippingFeeMinorFor(subtotalMinor: number) {
  return subtotalMinor >= FREE_SHIPPING_THRESHOLD_MINOR ? 0 : SHIPPING_FEE_PER_SHOP_MINOR
}

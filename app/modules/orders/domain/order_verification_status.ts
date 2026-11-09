/*
 * `orders.verification_status` (docs/04a §11.1): the values of
 * `orders_verification_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4). OD-57.
 */
export const ORDER_VERIFICATION_STATUSES = [
  'pending',
  'verified',
  'review_required',
  'failed',
] as const
export type OrderVerificationStatus = (typeof ORDER_VERIFICATION_STATUSES)[number]

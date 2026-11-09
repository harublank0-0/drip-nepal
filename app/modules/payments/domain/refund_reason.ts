/*
 * `refunds.reason_code` (docs/04a §12.4): the values of
 * `refunds_reason_check`, in its order. T-ARCH-011 fails if the two differ
 * (docs/04 §2.4).
 */
export const REFUND_REASONS = [
  'order_cancelled',
  'items_rejected',
  'undeliverable',
  'return_accepted',
  'late_capture',
  'stock_unavailable_after_payment',
  'goodwill',
  'other',
] as const
export type RefundReason = (typeof REFUND_REASONS)[number]

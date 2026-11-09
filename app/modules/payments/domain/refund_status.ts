/*
 * `refunds.status` (docs/04a §12.4): the values of `refunds_status_check`, in
 * its order. T-ARCH-011 fails if the two differ (docs/04 §2.4). Transitions:
 * docs/05 §6.7.
 */
export const REFUND_STATUSES = [
  'requested',
  'approved',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'needs_review',
] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

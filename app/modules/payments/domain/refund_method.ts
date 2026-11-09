/*
 * `refunds.method` (docs/04a §12.4): the values of `refunds_method_check`, in
 * its order. T-ARCH-011 fails if the two differ (docs/04 §2.4).
 */
export const REFUND_METHODS = ['gateway_api', 'gateway_manual', 'manual_transfer'] as const
export type RefundMethod = (typeof REFUND_METHODS)[number]

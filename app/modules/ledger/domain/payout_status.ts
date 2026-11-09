/*
 * `payouts.status` (docs/04a §13.2): the values of `payouts_status_check`, in
 * its order. T-ARCH-011 fails if the two differ (docs/04 §2.4).
 */
export const PAYOUT_STATUSES = ['draft', 'approved', 'paid', 'failed', 'cancelled'] as const
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

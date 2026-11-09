/*
 * `shop_payout_accounts.method` (docs/04a §6.7): the values of
 * `shop_payout_accounts_method_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const PAYOUT_ACCOUNT_METHODS = ['bank_transfer', 'wallet'] as const
export type PayoutAccountMethod = (typeof PAYOUT_ACCOUNT_METHODS)[number]

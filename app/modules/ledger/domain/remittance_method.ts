/*
 * `vendor_remittances.method` (docs/04a §13.4): the values of
 * `vendor_remittances_method_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const REMITTANCE_METHODS = ['bank_transfer', 'wallet', 'cash', 'other'] as const
export type RemittanceMethod = (typeof REMITTANCE_METHODS)[number]

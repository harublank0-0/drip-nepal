/*
 * `logistics_accounts.status` (docs/04a §9.9): the values of
 * `logistics_accounts_status_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const LOGISTICS_ACCOUNT_STATUSES = [
  'pending',
  'active',
  'invalid',
  'suspended',
  'disabled',
] as const
export type LogisticsAccountStatus = (typeof LOGISTICS_ACCOUNT_STATUSES)[number]

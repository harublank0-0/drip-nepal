/*
 * `logistics_accounts.owner_type` (docs/04a §9.9): the values of
 * `logistics_accounts_owner_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const LOGISTICS_ACCOUNT_OWNER_TYPES = ['platform', 'shop'] as const
export type LogisticsAccountOwnerType = (typeof LOGISTICS_ACCOUNT_OWNER_TYPES)[number]

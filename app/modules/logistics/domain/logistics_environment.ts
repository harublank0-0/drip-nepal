/*
 * `logistics_accounts.environment` (docs/04a §9.9): the values of
 * `logistics_accounts_environment_check`, in its order. T-ARCH-011 fails if
 * the two differ (docs/04 §2.4).
 */
export const LOGISTICS_ENVIRONMENTS = ['sandbox', 'production'] as const
export type LogisticsEnvironment = (typeof LOGISTICS_ENVIRONMENTS)[number]

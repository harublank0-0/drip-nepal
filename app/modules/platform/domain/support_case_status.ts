/*
 * `support_cases.status` (docs/04a §14.1): the values of
 * `support_cases_status_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const SUPPORT_CASE_STATUSES = [
  'open',
  'awaiting_customer',
  'awaiting_shop',
  'resolved',
  'closed',
] as const
export type SupportCaseStatus = (typeof SUPPORT_CASE_STATUSES)[number]

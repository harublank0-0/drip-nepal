/*
 * `support_cases.category` (docs/04a §14.1): the values of
 * `support_cases_category_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const SUPPORT_CASE_CATEGORIES = [
  'order_issue',
  'return_request',
  'refund',
  'delivery',
  'product_complaint',
  'account',
  'other',
] as const
export type SupportCaseCategory = (typeof SUPPORT_CASE_CATEGORIES)[number]

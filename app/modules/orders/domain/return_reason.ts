/*
 * `return_requests.reason_code` (docs/04a §11.7): the values of
 * `return_requests_reason_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const RETURN_REASONS = [
  'not_as_described',
  'damaged',
  'wrong_item',
  'size_issue',
  'changed_mind',
  'other',
] as const
export type ReturnReason = (typeof RETURN_REASONS)[number]

/*
 * `return_requests.status` (docs/04a §11.7): the values of
 * `return_requests_status_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4). Transitions: docs/05 §6.
 */
export const RETURN_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'in_transit',
  'received',
  'closed',
  'rejected_after_inspection',
] as const
export type ReturnStatus = (typeof RETURN_STATUSES)[number]

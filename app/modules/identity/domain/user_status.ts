/*
 * `users.status` (docs/04a §5.1): the values of `users_status_check`, in its
 * order. T-ARCH-011 fails if the two differ (docs/04 §2.4).
 */
export const USER_STATUSES = [
  'pending_verification',
  'active',
  'suspended',
  'deactivated',
  'anonymized',
] as const
export type UserStatus = (typeof USER_STATUSES)[number]

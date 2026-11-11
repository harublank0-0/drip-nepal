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

/*
 * The statuses that may keep a session (docs/07 §3.3 row 1): any other
 * status ends it with 403 `ACCOUNT_SUSPENDED`.
 */
export const SIGNED_IN_STATUSES: readonly UserStatus[] = ['pending_verification', 'active']

export function maySignIn(status: string) {
  return (SIGNED_IN_STATUSES as readonly string[]).includes(status)
}

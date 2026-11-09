/*
 * `platform_staff.role` (docs/04a §5.4): the values of
 * `platform_staff_role_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4). Permissions per role: docs/07 §4.2.
 */
export const PLATFORM_STAFF_ROLES = [
  'platform_admin',
  'support_agent',
  'catalog_moderator',
  'finance_officer',
] as const
export type PlatformStaffRole = (typeof PLATFORM_STAFF_ROLES)[number]

import db from '@adonisjs/lucid/services/db'

/*
 * The platform permissions the M6 courier operations need (docs/07 §4.2):
 * every platform permission also requires an active `platform_staff` row,
 * TOTP enrolled and MFA verified within 12 hours, which the
 * `platform_staff` middleware checks; the session gets its MFA time from
 * `verifyMfaChallenge` (M1 part 5). The full map comes with M1 part 7.
 */
export const PLATFORM_PERMISSIONS = {
  'platform.orders.intervene': ['platform_admin', 'support_agent'],
  // Proposed with M6 (OD-56).
  'platform.logistics.manage': ['platform_admin'],
} as const

export type PlatformPermission = keyof typeof PLATFORM_PERMISSIONS

export const MFA_WINDOW_MS = 12 * 60 * 60_000
// Step-up: MFA within the last 15 minutes [Assumption] (docs/07 §3.10).
export const STEP_UP_WINDOW_MS = 15 * 60_000

/*
 * The role of the user's unrevoked `platform_staff` row, enrolled in TOTP or
 * not, or null: the `platform_staff` middleware's 404 decision and the
 * staff check of the MFA operations (docs/06 §4.3), which tell enrolment
 * from verification themselves.
 */
export async function staffRoleOf(userId: string): Promise<string | null> {
  const row = await db
    .from('platform_staff')
    .where('user_id', userId)
    .whereNull('revoked_at')
    .select('role')
    .first()
  return row?.role ?? null
}

// The role of a staff member with TOTP enrolled, or null (the home page's admin link).
export async function activeStaffRole(userId: string): Promise<string | null> {
  const row = await db
    .from('platform_staff')
    .join('users', 'users.id', 'platform_staff.user_id')
    .where('platform_staff.user_id', userId)
    .whereNull('platform_staff.revoked_at')
    .whereNotNull('users.mfa_enabled_at')
    .select('platform_staff.role')
    .first()
  return row?.role ?? null
}

/** Every permission `role` holds, for the admin pages' navigation (docs/09 §13.7). */
export function staffPermissions(role: string): PlatformPermission[] {
  return (Object.keys(PLATFORM_PERMISSIONS) as PlatformPermission[]).filter((permission) =>
    staffMay(role, permission)
  )
}

export function staffMay(role: string, permission: PlatformPermission) {
  return (PLATFORM_PERMISSIONS[permission] as readonly string[]).includes(role)
}

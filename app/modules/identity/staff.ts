import db from '@adonisjs/lucid/services/db'

/*
 * The platform permissions the M6 courier operations need (docs/07 §4.2):
 * every platform permission also requires an active `platform_staff` row,
 * TOTP enrolled and MFA verified within 12 hours, which the
 * `platform_staff` middleware checks. M1 brings the full map and the MFA
 * challenge; until then no session carries `mfa_verified_at`, so these
 * operations answer 401 `MFA_REQUIRED` in production.
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

export function staffMay(role: string, permission: PlatformPermission) {
  return (PLATFORM_PERMISSIONS[permission] as readonly string[]).includes(role)
}

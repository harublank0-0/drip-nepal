import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { DomainError } from '#exceptions/domain_error'
import { SESSION_KEYS } from '#controllers/support/session'
import {
  activeStaffRole,
  MFA_WINDOW_MS,
  staffMay,
  type PlatformPermission,
} from '#modules/identity/staff'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    // Set only on routes that declare `platformStaff` (docs/07 §4.2).
    staff: { userId: string; role: string }
  }
}

/*
 * `platform_staff` (docs/07 §4.2, §3.9; docs/06 §4): runs after `auth` on
 * every `/api/v1/admin/*` route. A caller without an active `platform_staff`
 * row, or whose account is not active, gets 404 `NOT_FOUND`, so the admin API
 * does not advertise itself (06 §4.3). Staff need TOTP enrolled and MFA
 * verified within 12 hours (401 `MFA_REQUIRED` with `mfa`
 * `enrollment_required` or `verification_required`), and the route's
 * permission (403 `FORBIDDEN`).
 * Step-up operations check the 15-minute window themselves
 * (`assertStepUp`).
 */
export default class PlatformStaffMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { permission: PlatformPermission }) {
    const user = ctx.auth.getUserOrFail()
    // Without an active staff row, or with an account that is not active, the admin API does not exist.
    const role = user.status === 'active' ? await activeStaffRole(user.id) : null
    if (!role) throw new DomainError('NOT_FOUND')
    if (!user.mfaEnabledAt) {
      throw new DomainError('MFA_REQUIRED', { extensions: { mfa: 'enrollment_required' } })
    }
    if (!mfaWithin(ctx, MFA_WINDOW_MS)) {
      throw new DomainError('MFA_REQUIRED', { extensions: { mfa: 'verification_required' } })
    }
    // Set before the permission check, so the 403 page's navigation shows what the role can use.
    ctx.staff = { userId: user.id, role }
    if (!staffMay(role, options.permission)) throw new DomainError('FORBIDDEN')
    return next()
  }
}

export function mfaWithin(ctx: HttpContext, windowMs: number) {
  const at = ctx.session.get(SESSION_KEYS.mfaVerifiedAt)
  const time = typeof at === 'string' ? Date.parse(at) : Number.NaN
  return Number.isFinite(time) && Date.now() - time <= windowMs
}

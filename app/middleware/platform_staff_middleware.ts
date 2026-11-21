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
 * every `/api/v1/admin/*` route. The caller needs an active `platform_staff`
 * row with TOTP enrolled and MFA verified within 12 hours (401
 * `MFA_REQUIRED` otherwise), and the route's permission (403 `FORBIDDEN`).
 * Step-up operations check the 15-minute window themselves
 * (`assertStepUp`).
 */
export default class PlatformStaffMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { permission: PlatformPermission }) {
    const user = ctx.auth.getUserOrFail()
    const role = await activeStaffRole(user.id)
    if (!role) throw new DomainError('FORBIDDEN')
    if (!mfaWithin(ctx, MFA_WINDOW_MS)) {
      throw new DomainError('MFA_REQUIRED', { extensions: { verification_required: true } })
    }
    if (!staffMay(role, options.permission)) throw new DomainError('FORBIDDEN')
    ctx.staff = { userId: user.id, role }
    return next()
  }
}

export function mfaWithin(ctx: HttpContext, windowMs: number) {
  const at = ctx.session.get(SESSION_KEYS.mfaVerifiedAt)
  const time = typeof at === 'string' ? Date.parse(at) : Number.NaN
  return Number.isFinite(time) && Date.now() - time <= windowMs
}

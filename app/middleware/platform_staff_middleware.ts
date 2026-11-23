import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { DomainError } from '#exceptions/domain_error'
import { SESSION_KEYS, endSession, isUserInitiated } from '#controllers/support/session'
import { adminStanding, verifiedMfaTime } from '#modules/identity/queries'
import {
  MFA_WINDOW_MS,
  staffMay,
  staffRoleOf,
  type PlatformPermission,
} from '#modules/identity/staff'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    // Set only on routes that declare `platformStaff` (docs/07 §4.2).
    staff: { userId: string; role: string }
  }
}

/*
 * `platform_staff` (docs/07 §4.2, §3.4, §3.9; docs/06 §4.3): runs after
 * `auth` on every `/admin` page and `/api/v1/admin/*` route. In the order of
 * 06 §4.3 and 07 §4.8:
 * - a caller without an unrevoked `platform_staff` row, or whose account is
 *   not active, gets 404 `NOT_FOUND`, so the admin surface does not
 *   advertise itself, never 401 `MFA_REQUIRED`;
 * - a staff session older than 7 days from `authenticated_at` (proposed) is
 *   ended (logged out, untagged, cleared, regenerated): 401
 *   `UNAUTHENTICATED`, a page redirects to `/login`;
 * - staff without TOTP enrolled get 401 `MFA_REQUIRED` with
 *   `mfa: "enrollment_required"` (AC-FR-IAM-007-1, the `/admin` enrolment
 *   gate of docs/09 §9.1);
 * - more than 2 hours since `admin_seen_at` forgets the session's MFA proof
 *   and the session stays; that, or a proof older than 12 hours or made by
 *   another account or before this sign-in (docs/07 §3.2), gets 401
 *   `MFA_REQUIRED` with `mfa: "verification_required"`; a page redirects to
 *   `/mfa` with `return_to`;
 * - then the route's permission (403 `FORBIDDEN`).
 * A request that passes refreshes `admin_seen_at` when the user started it
 * (`isUserInitiated`: never a poll, 07 §3.4). Step-up operations check the
 * 15-minute window themselves (`assertStepUp`).
 */
export default class PlatformStaffMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { permission: PlatformPermission }) {
    const user = ctx.auth.getUserOrFail()
    // Without an active staff row, or with an account that is not active, the admin surface does not exist.
    const role = user.status === 'active' ? await staffRoleOf(user.id) : null
    if (!role) throw new DomainError('NOT_FOUND')

    const standing = adminStanding(
      {
        authenticatedAt: ctx.session.get(SESSION_KEYS.authenticatedAt),
        adminSeenAt: ctx.session.get(SESSION_KEYS.adminSeenAt),
        mfaVerifiedAt: ctx.session.get(SESSION_KEYS.mfaVerifiedAt),
      },
      user.id,
      MFA_WINDOW_MS
    )
    if (standing === 'expired') {
      await endSession(ctx)
      throw new DomainError('UNAUTHENTICATED', { detail: 'Please log in to continue.' })
    }
    if (!user.mfaEnabledAt) {
      throw new DomainError('MFA_REQUIRED', { extensions: { mfa: 'enrollment_required' } })
    }
    if (standing === 'idle') ctx.session.forget(SESSION_KEYS.mfaVerifiedAt)
    if (standing !== 'valid') {
      throw new DomainError('MFA_REQUIRED', { extensions: { mfa: 'verification_required' } })
    }
    if (isUserInitiated(ctx)) ctx.session.put(SESSION_KEYS.adminSeenAt, new Date().toISOString())

    // Set before the permission check, so the 403 page's navigation shows what the role can use.
    ctx.staff = { userId: user.id, role }
    if (!staffMay(role, options.permission)) throw new DomainError('FORBIDDEN')
    return next()
  }
}

/*
 * Whether the session holds the signed-in user's MFA proof from the last
 * `windowMs` (docs/07 §3.2): the 15-minute step-up (`assertStepUp`) and the
 * home page's admin link.
 */
export function mfaWithin(ctx: HttpContext, windowMs: number, now = Date.now()) {
  const user = ctx.auth.user
  if (!user) return false
  const verified = verifiedMfaTime(
    ctx.session.get(SESSION_KEYS.mfaVerifiedAt),
    user.id,
    ctx.session.get(SESSION_KEYS.authenticatedAt)
  )
  return verified !== null && now - verified <= windowMs
}

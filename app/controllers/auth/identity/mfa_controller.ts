import type { HttpContext } from '@adonisjs/core/http'
import { staffRoleOf } from '#modules/identity/staff'

/*
 * The `/mfa` page (docs/08 §2.3, §3.1 "MFA"; docs/07 §3.9; 01
 * AC-FR-IAM-007-1, -2; M1 part 5), server-rendered in the auth layout
 * (ADR-0003). GET only: the page writes through `startTotpEnrollment`,
 * `confirmTotpEnrollment` and `verifyMfaChallenge` (ADR-0004). Route in
 * start/routes/auth.ts.
 *
 * It opens signed in or not. The enrolment email links it as
 * `/mfa?token=…`, and the admin surface and `logIn` send staff here with a
 * `return_to`. It is a guest token route (docs/07 §3.3 row 3): a stale
 * session is ended and the page renders as a guest's, never a sign-in
 * redirect that would carry the token in `return_to` (07 §3.8). This GET
 * never reads the token; the page drops it from the URL on its first
 * render, keeps it in memory, and posts it with the password and the code.
 * A token page sends no referrer and is never stored (07 §7.3).
 *
 * Its one prop, `mfa_state`, says what the page shows:
 * - `sign_in`: no session; the page signs the staff member in in place and
 *   keeps the token (enrolment needs a session, 06 §13.3);
 * - `not_staff`: signed in, but not an active staff member;
 * - `enrol`: staff without TOTP (enrolment, AC-FR-IAM-007-1);
 * - `challenge`: staff with TOTP (the code, AC-FR-IAM-007-2).
 */
type MfaState = 'sign_in' | 'not_staff' | 'enrol' | 'challenge'

export default class MfaController {
  async show(ctx: HttpContext) {
    ctx.response.header('Referrer-Policy', 'no-referrer')
    ctx.response.header('Cache-Control', 'no-store')
    const user = ctx.auth.user
    let state: MfaState = 'sign_in'
    if (user) {
      const role = user.status === 'active' ? await staffRoleOf(user.id) : null
      if (!role) state = 'not_staff'
      else state = user.mfaEnabledAt ? 'challenge' : 'enrol'
    }
    return ctx.inertia.render('auth/mfa', { mfa_state: state })
  }
}

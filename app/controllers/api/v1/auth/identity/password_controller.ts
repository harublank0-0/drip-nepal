import type { HttpContext } from '@adonisjs/core/http'
import { SESSION_KEYS, rotateSessionId } from '#controllers/support/session'
import { auditIpHash } from '#modules/audit/actions/record_audit'
import { changePassword } from '#modules/identity/actions/change_password'
import { requestPasswordReset } from '#modules/identity/actions/request_password_reset'
import { resetPassword } from '#modules/identity/actions/reset_password'
import { assertKnownMembers } from '#validators/support/strict_keys'
import {
  CHANGE_PASSWORD_MEMBERS,
  changePasswordValidator,
} from '#validators/identity/change_password'
import {
  REQUEST_PASSWORD_RESET_MEMBERS,
  requestPasswordResetValidator,
} from '#validators/identity/request_password_reset'
import { RESET_PASSWORD_MEMBERS, resetPasswordValidator } from '#validators/identity/reset_password'

/*
 * Password reset and change (docs/06 §13.3; 01 FR-IAM-004, FR-IAM-005; 02
 * J-18; M1 part 4). The routes are in start/routes/api_v1/auth.ts, named by
 * their operationIds. Each method refuses unknown members, validates,
 * calls one identity action and answers.
 *
 * `requestPasswordReset` and `resetPassword` are open to anyone, signed in
 * or not, like `signUp` and `confirmEmail`: the emailed link may be opened
 * on any device. Neither signs anyone in or changes the session (docs/07
 * TM-09, AC-FR-IAM-004-4); a reset rotates the stamp, so a session of the
 * same account in this browser is refused on its next request.
 *
 * `changePassword` runs behind `auth`. The acting session stays signed in
 * (AC-FR-IAM-005-2): it receives the new stamp in this request and a new
 * session ID, re-tagged (`rotateSessionId`, docs/07 §3.1), before the
 * response commits it; `identity.revoke_sessions` then spares it.
 */
export default class PasswordController {
  // requestPasswordReset: 202 with the same body for every address (AC-FR-IAM-004-1).
  async requestPasswordReset(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), REQUEST_PASSWORD_RESET_MEMBERS)
    const input = await ctx.request.validateUsing(requestPasswordResetValidator)
    const result = await requestPasswordReset(input.email, {
      ip: ctx.request.ip(),
      requestId: ctx.request.id() ?? null,
    })
    return ctx.response.accepted({ data: { status: result.status } })
  }

  // resetPassword: 200; nobody is signed in, and every session of the account ends.
  async resetPassword(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), RESET_PASSWORD_MEMBERS)
    const input = await ctx.request.validateUsing(resetPasswordValidator)
    const result = await resetPassword(input.token, input.password, {
      requestId: ctx.request.id() ?? null,
      ipHash: auditIpHash(ctx.request.ip()),
    })
    return { data: { status: result.status } }
  }

  // changePassword: 200; this session keeps working under a new ID, the others end.
  async changePassword(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), CHANGE_PASSWORD_MEMBERS)
    const input = await ctx.request.validateUsing(changePasswordValidator)
    const user = ctx.auth.getUserOrFail()
    const result = await changePassword(
      user.id,
      {
        currentPassword: input.current_password,
        newPassword: input.new_password,
        // The account check has just compared it with the session's stamp (docs/07 §3.3).
        sessionStamp: user.securityStamp,
      },
      {
        ip: ctx.request.ip(),
        requestId: ctx.request.id() ?? null,
        ipHash: auditIpHash(ctx.request.ip()),
      }
    )
    ctx.session.put(SESSION_KEYS.securityStamp, result.securityStamp)
    await rotateSessionId(ctx)
    return { data: { status: 'password_changed' as const } }
  }
}

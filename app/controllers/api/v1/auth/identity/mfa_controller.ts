import type { HttpContext } from '@adonisjs/core/http'
import { recordMfaVerified, rotateSessionId } from '#controllers/support/session'
import { auditIpHash } from '#modules/audit/actions/record_audit'
import { confirmTotpEnrollment } from '#modules/identity/actions/confirm_totp_enrollment'
import { startTotpEnrollment } from '#modules/identity/actions/start_totp_enrollment'
import { verifyMfaChallenge } from '#modules/identity/actions/verify_mfa_challenge'
import { safeReturnPath } from '#modules/identity/queries'
import { assertKnownMembers } from '#validators/support/strict_keys'
import {
  CONFIRM_TOTP_ENROLLMENT_MEMBERS,
  START_TOTP_ENROLLMENT_MEMBERS,
  VERIFY_MFA_CHALLENGE_MEMBERS,
  confirmTotpEnrollmentValidator,
  startTotpEnrollmentValidator,
  verifyMfaChallengeValidator,
} from '#validators/identity/mfa'

/*
 * Staff MFA (docs/06 §13.3; docs/07 §3.9; 01 FR-IAM-007; M1 part 5). The
 * routes are in start/routes/api_v1/auth.ts, named by their operationIds;
 * each runs behind `auth`. Each method refuses unknown members, validates,
 * calls one identity action and answers.
 *
 * - `startTotpEnrollment` answers the secret and the `otpauth://` URI once,
 *   with `Cache-Control: private, no-store`, as every API answer has (06
 *   §3.8).
 * - `confirmTotpEnrollment` turns TOTP on and leaves the session as it is:
 *   only `verifyMfaChallenge` writes the MFA proof (07 §3.2).
 * - `verifyMfaChallenge` records the proof (`mfa_verified_at` as
 *   `{ user_id, at }` and `admin_seen_at`, `recordMfaVerified`) and
 *   rotates the session ID, re-tagged (`rotateSessionId`, 07 §3.1, §3.9).
 *   Its `redirect_to` is `return_to` checked by the helper of docs/07
 *   TM-14, or `/`, as for `logIn`; a rejected value is logged by its length
 *   only.
 */
export default class MfaController {
  private context(ctx: HttpContext) {
    return {
      ip: ctx.request.ip(),
      requestId: ctx.request.id() ?? null,
      ipHash: auditIpHash(ctx.request.ip()),
    }
  }

  // startTotpEnrollment: 200 `{ data: { otpauth_uri, secret } }`, shown once.
  async startTotpEnrollment(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), START_TOTP_ENROLLMENT_MEMBERS)
    const input = await ctx.request.validateUsing(startTotpEnrollmentValidator)
    const user = ctx.auth.getUserOrFail()
    const { requestId, ipHash } = this.context(ctx)
    const result = await startTotpEnrollment(
      user.id,
      { token: input.token, password: input.password },
      { requestId, ipHash }
    )
    return { data: { otpauth_uri: result.otpauthUri, secret: result.secret } }
  }

  // confirmTotpEnrollment: 200; TOTP is on, and the page asks for the next code.
  async confirmTotpEnrollment(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), CONFIRM_TOTP_ENROLLMENT_MEMBERS)
    const input = await ctx.request.validateUsing(confirmTotpEnrollmentValidator)
    const user = ctx.auth.getUserOrFail()
    const result = await confirmTotpEnrollment(
      user.id,
      { code: input.code, token: input.token },
      this.context(ctx)
    )
    return { data: { status: result.status } }
  }

  // verifyMfaChallenge: 200 `{ data: { redirect_to } }`; the session holds the proof under a new ID.
  async verifyMfaChallenge(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), VERIFY_MFA_CHALLENGE_MEMBERS)
    const input = await ctx.request.validateUsing(verifyMfaChallengeValidator)
    const user = ctx.auth.getUserOrFail()
    await verifyMfaChallenge(user.id, input.code, this.context(ctx))
    recordMfaVerified(ctx, user.id)
    await rotateSessionId(ctx)

    const returnTo = input.return_to ?? null
    const redirectTo = safeReturnPath(returnTo)
    // TM-14's detective control: the length only, never the value.
    if (returnTo !== null && redirectTo === null) {
      ctx.logger.info({ return_to_length: returnTo.length }, 'auth.return_to_rejected')
    }
    return { data: { redirect_to: redirectTo ?? '/' } }
  }
}

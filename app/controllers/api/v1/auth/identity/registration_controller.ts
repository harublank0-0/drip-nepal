import type { HttpContext } from '@adonisjs/core/http'
import { auditIpHash } from '#modules/audit/actions/record_audit'
import { confirmEmail } from '#modules/identity/actions/confirm_email'
import { resendEmailVerification } from '#modules/identity/actions/resend_email_verification'
import { signUp } from '#modules/identity/actions/sign_up'
import { assertKnownMembers } from '#validators/support/strict_keys'
import { CONFIRM_EMAIL_MEMBERS, confirmEmailValidator } from '#validators/identity/confirm_email'
import { SIGN_UP_MEMBERS, signUpValidator } from '#validators/identity/sign_up'

/*
 * Sign-up and email verification (docs/06 §13.3; M1 part 2a). The routes
 * are in start/routes/api_v1/auth.ts, named by their operationIds. Each
 * method refuses unknown members, validates, calls one identity action and
 * answers. No method signs anyone in or changes the session (docs/07
 * TM-09); `signUp` and `confirmEmail` take no session, and
 * `resendEmailVerification` runs behind `auth`.
 */
export default class RegistrationController {
  // signUp: 202 with the same body for a new and a registered email (AC-FR-IAM-001-2).
  async signUp(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), SIGN_UP_MEMBERS)
    const input = await ctx.request.validateUsing(signUpValidator)
    const result = await signUp(
      {
        email: input.email,
        password: input.password,
        fullName: input.full_name,
        phoneE164: input.phone ?? null,
        marketingEmailConsent: input.marketing_email_consent,
        marketingSmsConsent: input.marketing_sms_consent,
      },
      {
        ip: ctx.request.ip(),
        requestId: ctx.request.id() ?? null,
        ipHash: auditIpHash(ctx.request.ip()),
      }
    )
    return ctx.response.accepted({ data: { status: result.status } })
  }

  // confirmEmail: 200 `{ status: 'active' }`, also for the link that already verified the account.
  async confirmEmail(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), CONFIRM_EMAIL_MEMBERS)
    const input = await ctx.request.validateUsing(confirmEmailValidator)
    const result = await confirmEmail(input.token, {
      requestId: ctx.request.id() ?? null,
      ipHash: auditIpHash(ctx.request.ip()),
    })
    return { data: { status: result.status } }
  }

  // resendEmailVerification: 202; the signed-in user's earlier link stops working.
  async resendEmailVerification(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), [])
    const result = await resendEmailVerification(ctx.auth.getUserOrFail().id, {
      requestId: ctx.request.id() ?? null,
    })
    return ctx.response.accepted({ data: { status: result.status } })
  }
}

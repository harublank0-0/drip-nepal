import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { InvariantViolation } from '#exceptions/programming_errors'
import { auditIpHash } from '#modules/audit/actions/record_audit'
import { STEP_UP_WINDOW_MS } from '#modules/identity/staff'
import type { OwnShopCheck } from '#modules/platform/own_shop'
import { ownShopCheck } from '#modules/shops/actions/own_shop_check'
import { mfaWithin } from '#middleware/platform_staff_middleware'
import { recordMfaVerified } from '#controllers/support/session'

/*
 * OD-44's own-shop check for an admin operation that acts on a shop or its
 * orders (docs/07 §4.1 item 4, §4.5; R1-S part 1c-ii). The controller
 * validates the body, builds the guard with the body's `totp_code`, and
 * calls its action through `run`, which passes the check in:
 *
 *   const guard = ownShopGuard(ctx, input.totp_code, { stepUp: true })
 *   const result = await guard.run((ownShop) => someAction(command, { ownShop, ... }))
 *
 * For a step-up operation (07 §3.10), a session past the 15-minute window
 * answers 401 `MFA_REQUIRED` unless the body carries `totp_code`; then the
 * action checks that code on whatever shop it touches. The controller calls
 * `assertStepUpOrCode` before validating, so a stale session gets the 401
 * before any 422, as before (06 §4.3). After a request whose code passed,
 * the session's `mfa_verified_at` is refreshed, without a new session ID
 * (07 §3.10). A step-up taken by code that succeeds without the action
 * having spent the code is a programming error (an action that skipped the
 * check): it answers 500 and is reported.
 */

const stepUpRefusal = () =>
  new DomainError('MFA_REQUIRED', { extensions: { mfa: 'verification_required' } })

// Before validation: a stale step-up with no `totp_code` member in the body is 401 at once.
export function assertStepUpOrCode(ctx: HttpContext) {
  const body = ctx.request.body() as Record<string, unknown>
  if (body.totp_code === undefined && !mfaWithin(ctx, STEP_UP_WINDOW_MS)) throw stepUpRefusal()
}

export function ownShopGuard(
  ctx: HttpContext,
  totpCode: string | undefined,
  options: { stepUp: boolean }
) {
  let stepUpByCode = false
  if (options.stepUp && !mfaWithin(ctx, STEP_UP_WINDOW_MS)) {
    if (!totpCode) throw stepUpRefusal()
    stepUpByCode = true
  }
  const userId = ctx.staff.userId
  const ip = ctx.request.ip()
  const guard = ownShopCheck({
    userId,
    totpCode,
    stepUpByCode,
    context: { ip, requestId: ctx.request.id() ?? null, ipHash: auditIpHash(ip) },
  })
  return {
    async run<T>(work: (ownShop: OwnShopCheck) => Promise<T>): Promise<T> {
      const result = await guard.run(() => work(guard.check))
      if (guard.codeVerified) recordMfaVerified(ctx, userId)
      else if (stepUpByCode) {
        throw new InvariantViolation(
          'a stale step-up passed by code without the action checking it'
        )
      }
      return result
    },
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { auditIpHash } from '#modules/audit/actions/record_audit'
import { STEP_UP_WINDOW_MS } from '#modules/identity/staff'
import type { OwnShopCheck } from '#modules/platform/own_shop'
import { ownShopCheck } from '#modules/shops/actions/own_shop_check'
import { mfaWithin } from '#middleware/platform_staff_middleware'
import { recordMfaVerified } from '#controllers/support/session'

/*
 * OD-44's own-shop check for an admin operation that acts on a shop or its
 * orders (docs/07 §4.1 rule 4, §4.5; R1-S part 1c-ii). The controller
 * validates the body, builds the guard with the body's `totp_code`, and
 * calls its action through `run`, which passes the check in:
 *
 *   const guard = ownShopGuard(ctx, input.totp_code, { stepUp: true })
 *   const result = await guard.run((ownShop) => someAction(command, { ownShop, ... }))
 *
 * For a step-up operation (07 §3.10), a session past the 15-minute window
 * answers 401 `MFA_REQUIRED` unless the body carries `totp_code`; then the
 * action checks that code on whatever shop it touches. After a request
 * whose code passed, the session's `mfa_verified_at` is refreshed, without
 * a new session ID (07 §3.10).
 */
export function ownShopGuard(
  ctx: HttpContext,
  totpCode: string | undefined,
  options: { stepUp: boolean }
) {
  let stepUpByCode = false
  if (options.stepUp && !mfaWithin(ctx, STEP_UP_WINDOW_MS)) {
    if (!totpCode) {
      throw new DomainError('MFA_REQUIRED', { extensions: { mfa: 'verification_required' } })
    }
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
      return result
    },
  }
}

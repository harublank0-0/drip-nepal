import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import {
  endSession,
  recordMfaVerified,
  SESSION_KEYS,
  startSession,
} from '#controllers/support/session'
import { developmentOnlyRefusalHere } from '#modules/platform/development_only'
import { devSignInAccounts, devSignInUser, staffWithoutTotpCount } from '#modules/identity/queries'
import { devSignInAccountJson } from '#transformers/dev_sign_in_transformer'

/*
 * The development-only sign-in (docs/07 §3.13), registered only outside
 * production (guard 1, start/routes.ts and T-UI-026). `/login` signs in
 * with a password since M1 part 3 and `/mfa` checks the code since M1 part
 * 5; this page stays for development: it skips both, recording the MFA
 * proof `verifyMfaChallenge` would (`recordMfaVerified`), so the admin pages
 * open for staff whose enrolment is the demo seeder's placeholder, which no
 * code can match. It writes nothing but the session: no audit row, no login
 * event, no throttle row (T-SEC-044).
 */
export default class DevSignInController {
  async show(ctx: HttpContext) {
    await refuseOutsideDevelopment()
    const accounts = await devSignInAccounts()
    return ctx.inertia.render('dev/sign_in', {
      accounts: accounts.map(devSignInAccountJson),
      staff_without_totp: await staffWithoutTotpCount(),
      signed_in_as: ctx.auth.user?.email ?? null,
      // Staff only (docs/07 §3.13): when the admin pages' MFA window started.
      mfa_verified_at: mfaTimeOf(ctx.session.get(SESSION_KEYS.mfaVerifiedAt)),
    })
  }

  async store(ctx: HttpContext) {
    await refuseOutsideDevelopment()
    // Guard 3: any other ID answers 404, as a missing one does.
    const found = await devSignInUser(ctx.params.id)
    if (!found) throw new DomainError('NOT_FOUND')
    await startSession(ctx, found.user, found.user.securityStamp)
    // In place of verifyMfaChallenge (docs/07 §3.9): the admin pages and step-up open.
    if (found.staff) recordMfaVerified(ctx, found.user.id)
    return ctx.response.redirect().toRoute('dev.sign_in')
  }

  async destroy(ctx: HttpContext) {
    await refuseOutsideDevelopment()
    await endSession(ctx)
    return ctx.response.redirect().toRoute('dev.sign_in')
  }
}

// Guard 2: the development seeders' check, on every request.
async function refuseOutsideDevelopment() {
  if (await developmentOnlyRefusalHere('the development sign-in')) {
    throw new DomainError('NOT_FOUND')
  }
}

// The `at` of the session's MFA proof (`{ user_id, at }`, docs/07 §3.2), or null.
function mfaTimeOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const at = (value as { at?: unknown }).at
  return typeof at === 'string' ? at : null
}

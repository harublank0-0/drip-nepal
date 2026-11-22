import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { endSession, SESSION_KEYS, startSession } from '#controllers/support/session'
import { developmentOnlyRefusalHere } from '#modules/platform/development_only'
import { devSignInAccounts, devSignInUser, staffWithoutTotpCount } from '#modules/identity/queries'
import { devSignInAccountJson } from '#transformers/dev_sign_in_transformer'

/*
 * The development-only sign-in (docs/07 §3.13), registered only outside
 * production (guard 1, start/routes.ts and T-UI-026). It stands in for M1's
 * `logIn` and MFA challenge so the pages built ahead of M1 can be opened.
 * It writes nothing but the session: no audit row, no login event, no
 * throttle row (T-SEC-044).
 */
export default class DevSignInController {
  async show(ctx: HttpContext) {
    await refuseOutsideDevelopment()
    const accounts = await devSignInAccounts()
    return ctx.inertia.render('dev/sign_in', {
      accounts: accounts.map(devSignInAccountJson),
      staff_without_totp: await staffWithoutTotpCount(),
      signed_in_as: ctx.auth.user?.email ?? null,
    })
  }

  async store(ctx: HttpContext) {
    await refuseOutsideDevelopment()
    // Guard 3: any other ID answers 404, as a missing one does.
    const found = await devSignInUser(ctx.params.id)
    if (!found) throw new DomainError('NOT_FOUND')
    await startSession(ctx, found.user, found.user.securityStamp)
    // In place of verifyMfaChallenge (docs/07 §3.9): the admin pages and step-up open.
    if (found.staff) ctx.session.put(SESSION_KEYS.mfaVerifiedAt, new Date().toISOString())
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

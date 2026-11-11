import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { DomainError } from '#exceptions/domain_error'
import { endSession, SESSION_KEYS } from '#controllers/support/session'
import { accountStanding } from '#modules/identity/queries'

/*
 * The per-request account check (docs/07 §3.3, ADR-0005 decisions 2 and 3).
 * It runs in the router stack right after `silent_auth`, which has loaded
 * the user, so it costs no extra query; `identity.accountStanding` decides
 * from that user and the session, in the row order of 07 §3.3:
 *
 * 1. a user who is not `active` or `pending_verification`: 403
 *    `ACCOUNT_SUSPENDED` (a page redirects to /login with a notice);
 * 3. a session `security_stamp` that is missing or differs from the user's:
 *    401 `UNAUTHENTICATED` (a page redirects to /login);
 * 4. a session older than the 30-day absolute limit, or without
 *    `authenticated_at`: 401 `UNAUTHENTICATED`.
 *
 * Each ends the session first: logged out, untagged, cleared, regenerated.
 * Row 2 (no session left) needs no code here: the guard finds no user, and
 * the `auth` middleware or the exception handler answers 401. The seller
 * and admin limits belong to their route groups (07 §3.4).
 */
export default class AccountStatusMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user
    if (!user) return next()

    const standing = accountStanding(user, {
      securityStamp: ctx.session.get(SESSION_KEYS.securityStamp),
      authenticatedAt: ctx.session.get(SESSION_KEYS.authenticatedAt),
    })
    if (standing === 'valid') return next()

    await endSession(ctx)
    if (standing === 'suspended') {
      throw new DomainError('ACCOUNT_SUSPENDED', { detail: 'Your account is suspended.' })
    }
    throw new DomainError('UNAUTHENTICATED', { detail: 'Please log in to continue.' })
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'
import { DomainError } from '#exceptions/domain_error'

/*
 * `guest` (docs/09 §3.4 row 3): only on the sign-in, sign-up and reset
 * pages and on `logIn` (T-UI-025), so a signed-in session must log out
 * before it signs in as another account (docs/07 §3.2).
 *
 * - A page visit by a signed-in user is redirected to `/account` (02 J-04
 *   "Permissions"; the account page exists since M1 part 6a), without the
 *   visited query.
 * - An API call (`logIn`) by a signed-in user gets 409 `CONFLICT`
 *   problem+json, "You are already signed in", instead of a redirect a
 *   JSON client cannot use (docs/06 §13.3 [Assumption]); the client
 *   reloads the page.
 */
export default class GuestMiddleware {
  redirectTo = '/account'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: { guards?: (keyof Authenticators)[] } = {}
  ) {
    for (const guard of options.guards || [ctx.auth.defaultGuard]) {
      if (await ctx.auth.use(guard).check()) {
        if (ctx.request.url().startsWith('/api/')) {
          throw new DomainError('CONFLICT', { detail: 'You are already signed in.' })
        }
        ctx.session.reflash()
        // Never the visited query (docs/07 TM-14): `/login?return_to=…` must not carry it on.
        return ctx.response.redirect().withQs(false).toPath(this.redirectTo)
      }
    }

    return next()
  }
}

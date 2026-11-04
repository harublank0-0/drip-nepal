import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { canSignIn } from '#modules/auth/account_access'

/**
 * Silent auth middleware can be used as a global middleware to silent check
 * if the user is logged-in or not.
 *
 * The request continues as usual, even when the user is not logged-in.
 */
export default class SilentAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.check()

    // A suspended or deleted account loses its session on the next request,
    // not only at its next login (RF-04).
    const user = ctx.auth.user
    if (user && !canSignIn(user)) {
      await ctx.auth.use('web').logout()
    }

    return next()
  }
}

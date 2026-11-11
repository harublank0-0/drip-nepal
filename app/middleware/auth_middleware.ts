import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'
import { errors as authErrors } from '@adonisjs/auth'
import { DomainError } from '#exceptions/domain_error'

/*
 * Routes that need a signed-in user. A request without one throws
 * UNAUTHENTICATED: the exception handler answers 401 problem+json under
 * /api/ and redirects a page visit to /login with the visited URL as the
 * `return_to` query (docs/09 §5.4). Nothing goes into the session: no
 * intended URL is ever stored, so a token in a path never reaches
 * `sessions.data` (docs/07 §3.2, TM-14). `/login` validates `return_to`
 * with the single helper of docs/07 TM-14 (app/modules/auth/return_path.ts).
 */
export default class AuthMiddleware {
  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
    try {
      await ctx.auth.authenticateUsing(options.guards)
    } catch (error) {
      if (error instanceof authErrors.E_UNAUTHORIZED_ACCESS)
        throw new DomainError('UNAUTHENTICATED')
      throw error
    }
    return next()
  }
}

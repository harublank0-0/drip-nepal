import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'
import { errors as authErrors } from '@adonisjs/auth'

const LOGIN_PROMPT = 'Log in or create an account to continue.'

/*
 * The page to come back to after logging in: the page itself for a GET,
 * the page the request came from for anything else (adding to the cart
 * from a product page, for example). Only paths on this site are kept.
 */
function returnPath(ctx: HttpContext): string | null {
  if (ctx.request.method() === 'GET') {
    return ctx.request.url(true)
  }

  const referrer = ctx.request.header('referer')
  if (!referrer) return null
  try {
    const url = new URL(referrer)
    if (url.host !== ctx.request.host()) return null
    return url.pathname + url.search
  } catch {
    return null
  }
}

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  /**
   * The URL to redirect to, when authentication fails
   */
  redirectTo = '/auth/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
    try {
      await ctx.auth.authenticateUsing(options.guards, { loginRoute: this.redirectTo })
    } catch (error) {
      if (!(error instanceof authErrors.E_UNAUTHORIZED_ACCESS)) throw error

      const path = returnPath(ctx)
      if (path?.startsWith('/') && !path.startsWith('//') && !path.startsWith('/api/')) {
        ctx.session.setIntendedUrl(path)
      }
      throw new authErrors.E_UNAUTHORIZED_ACCESS(LOGIN_PROMPT, {
        redirectTo: this.redirectTo,
        guardDriverName: error.guardDriverName,
      })
    }
    return next()
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { OWN_LIMIT_OPERATIONS, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'

/*
 * The per-user API limits of docs/06 §9.1 (M1 part 6a), in the router stack
 * right after the account check, so the user is the one `silent_auth`
 * loaded and the account check has just passed. Every `/api/v1` request
 * made with a signed-in session takes one point: of `api_staff` under
 * `/api/v1/admin/`, else of `api_user`, keyed on the user (`api:user:` and
 * `admin:user:` with the HMAC of the ID). Not charged: a request without a
 * signed-in user (the route's `auth` answers it), the webhooks, and the
 * operations that a row of their own names (`OWN_LIMIT_OPERATIONS`), so
 * nothing is counted twice. Past the limit: 429 `RATE_LIMITED` with
 * `Retry-After` (docs/06 §5.3), before the route's own middleware and the
 * controller run.
 */
export default class ApiLimitsMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user
    const path = ctx.request.url()
    if (
      user &&
      path.startsWith('/api/v1/') &&
      !path.startsWith('/api/v1/webhooks/') &&
      !OWN_LIMIT_OPERATIONS.has(ctx.route?.name ?? '')
    ) {
      const name = path.startsWith('/api/v1/admin/') ? 'api_staff' : 'api_user'
      await rateLimiter(name).consume(rateLimitKey(name, String(user.id)))
    }
    return next()
  }
}

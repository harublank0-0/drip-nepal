import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import {
  IP_LIMIT_OPERATIONS,
  OWN_LIMIT_OPERATIONS,
  USER_LIMIT_OPERATIONS,
  clientNetwork,
  rateLimitKey,
  rateLimiter,
} from '#modules/platform/rate_limits'

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
 *
 * The public reads of `IP_LIMIT_OPERATIONS` (M1 part 6b: the location
 * cascades, `catalog_ip`) take a point of their row instead, keyed on the
 * client network (`clientNetwork`, docs/07 §3.6), whether a user is signed
 * in or not: they are open to guests, so a per-user key would not bound
 * them.
 *
 * The writes of `USER_LIMIT_OPERATIONS` (R1-S part 1b: `updateShopProfile`
 * on `shop_profile_update`) take a point of their own row instead, keyed on
 * the signed-in user, here and so before the route's middleware and every
 * check, so a refused call is charged like an accepted one.
 */
export default class ApiLimitsMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const operation = ctx.route?.name ?? ''
    const perNetwork = IP_LIMIT_OPERATIONS.get(operation)
    if (perNetwork) {
      const network = clientNetwork(ctx.request.ip())
      await rateLimiter(perNetwork).consume(rateLimitKey(perNetwork, network))
      return next()
    }
    const user = ctx.auth.user
    const perUser = USER_LIMIT_OPERATIONS.get(operation)
    if (perUser) {
      // A guest is answered by the route's `auth`.
      if (user) await rateLimiter(perUser).consume(rateLimitKey(perUser, String(user.id)))
      return next()
    }
    const path = ctx.request.url()
    if (
      user &&
      path.startsWith('/api/v1/') &&
      !path.startsWith('/api/v1/webhooks/') &&
      !OWN_LIMIT_OPERATIONS.has(operation)
    ) {
      const name = path.startsWith('/api/v1/admin/') ? 'api_staff' : 'api_user'
      await rateLimiter(name).consume(rateLimitKey(name, String(user.id)))
    }
    return next()
  }
}

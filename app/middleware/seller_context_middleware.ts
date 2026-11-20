import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { DomainError } from '#exceptions/domain_error'
import { endSession, isUserInitiated, SESSION_KEYS } from '#controllers/support/session'
import { sellerSessionIdle } from '#modules/identity/queries'
import { resolveSellerContext, type SellerContext } from '#modules/shops/queries'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    // Set only on routes that declare `sellerContext` (docs/09 §3.4).
    shop: SellerContext
  }
}

/*
 * The access requirement a seller route declares (docs/07 §4.8). M0 builds
 * the membership guard, so a route can ask for no more than it enforces:
 * `shop.member`, the owner or any active member. M2 adds the permission
 * slugs, `shop.owner`, `mediaByKind`, `gateAs` and the status gate of
 * docs/07 §4.4 (docs/12 §5.2).
 */
export type SellerContextOptions = { requirement: 'shop.member' }

/*
 * `seller_context` (docs/09 §3.4 row 5, §12.4; docs/06 §4.4 steps 1, 2 and
 * 5). Runs after `auth` (T-SEC-037) on every `{shopSlug}` seller route
 * (T-SEC-005), in this order:
 * 1. An unknown slug and a caller who is neither the owner nor an active
 *    member get the same 404, so a slug cannot be probed (T-SEC-001), and
 *    keep their session.
 * 2. The seller idle limit (docs/07 §3.4, T-SEC-009): 12 hours since
 *    `seller_seen_at` ends the session with 401 `UNAUTHENTICATED`, a
 *    redirect to /login on a page.
 * 3. A retired slug answers a page with 301 to the current one, so only a
 *    member learns where it points; an API route continues with the
 *    resolved shop, whose ID keeps idempotency fingerprints stable
 *    (docs/06 §7.2).
 * 4. A user-initiated request refreshes `seller_seen_at`; a poll does not.
 */
export default class SellerContextMiddleware {
  async handle(ctx: HttpContext, next: NextFn, _options: SellerContextOptions) {
    const user = ctx.auth.getUserOrFail()
    const slug = ctx.params.shopSlug
    const found = typeof slug === 'string' ? await resolveSellerContext(slug, user.id) : null
    if (!found) throw new DomainError('NOT_FOUND')

    const idle = sellerSessionIdle({
      sellerSeenAt: ctx.session.get(SESSION_KEYS.sellerSeenAt),
      authenticatedAt: ctx.session.get(SESSION_KEYS.authenticatedAt),
    })
    if (idle) {
      await endSession(ctx)
      throw new DomainError('UNAUTHENTICATED', { detail: 'Please log in to continue.' })
    }

    if (found.viaRedirect && !ctx.request.url().startsWith('/api/')) {
      return ctx.response
        .redirect()
        .status(301)
        .withQs(false)
        .toPath(withCurrentSlug(ctx, found.slug))
    }

    ctx.shop = found
    if (isUserInitiated(ctx)) {
      ctx.session.put(SESSION_KEYS.sellerSeenAt, new Date().toISOString())
    }
    return next()
  }
}

/*
 * The request's path with the `:shopSlug` segment replaced by the shop's
 * current slug, and the query string exactly as it came.
 */
function withCurrentSlug(ctx: HttpContext, slug: string) {
  const pattern = (ctx.route?.pattern ?? '').split('/')
  const segments = ctx.request.url().split('/')
  const at = pattern.indexOf(':shopSlug')
  if (at !== -1 && at < segments.length) segments[at] = encodeURIComponent(slug)
  const query = ctx.request.parsedUrl.query
  return segments.join('/') + (query ? `?${query}` : '')
}

import { createHash } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import {
  authenticateCourierCallback,
  storeCourierCallback,
} from '#modules/orders/actions/receive_courier_callback'
import { rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'

/*
 * `receiveCourierCallback` (docs/06 §12.6; M6): no session, CSRF-exempt by
 * exact route; `webhook_ip` and the 64 KB cap ran in the route middleware.
 * The URL token is checked before anything is read or stored, then the
 * per-account `courier_callback` limiter, then the body. Every accepted
 * callback is answered `200 { data: { received: true } }`, also when nothing
 * was stored (a test event, a comment, an unmatched parcel, a disabled
 * account), so the courier learns nothing about our data.
 */
export default class CourierCallbacksController {
  async receive(ctx: HttpContext) {
    const rawBody = ctx.request.raw() ?? ''
    const bodySha256 = createHash('sha256').update(rawBody, 'utf8').digest('hex')
    const token = ctx.request.qs().token
    const account = await authenticateCourierCallback({
      providerCode: ctx.params.providerCode,
      accountId: ctx.params.accountId,
      token: typeof token === 'string' ? token : null,
      bodySha256,
    })
    await rateLimiter('courier_callback').consume(
      rateLimitKey('courier_callback', ctx.params.accountId)
    )
    await storeCourierCallback({
      providerCode: ctx.params.providerCode,
      accountId: ctx.params.accountId,
      accountStatus: account.status,
      rawBody,
      requestId: ctx.request.id() ?? null,
    })
    return { data: { received: true } }
  }
}

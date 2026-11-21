import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { DomainError } from '#exceptions/domain_error'
import { clientNetwork, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'

/*
 * The courier callback route's first two steps (docs/06 §12.6, §9.1–§9.2):
 * the `webhook_ip` limiter before anything else, then a 64 KB body cap, so a
 * forged flood is refused before the URL token is even compared.
 */
export const COURIER_CALLBACK_BODY_LIMIT_BYTES = 64 * 1024

export default class CourierCallbackBodyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const network = clientNetwork(ctx.request.ip())
    await rateLimiter('webhook_ip').consume(rateLimitKey('webhook_ip', network))
    const raw = ctx.request.raw() ?? ''
    if (Buffer.byteLength(raw, 'utf8') > COURIER_CALLBACK_BODY_LIMIT_BYTES) {
      throw new DomainError('PAYLOAD_TOO_LARGE', { detail: 'The request is too large.' })
    }
    return next()
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { hmacKeys } from '#config/crypto'
import { keyedHash } from '#modules/platform/crypto/keyed_hash'

/*
 * One `http.request` line per request (docs/09 §7.4 "Access line"), the
 * second server middleware. It logs the route pattern, never the raw URL,
 * so a token in a path (`/invitations/{token}`) stays out of the logs
 * (docs/03 §12.1); a URL with no route logs `route: null`. The status read
 * after `next()` is final even when the route threw: the exception handler
 * has already written the error response by then.
 *
 * The `/health/*` probes of docs/11 §7.1 get no line.
 *
 * `ip_hash` is the keyed hash of the client IP with `HMAC_KEY_AUDIT_IP`, the
 * same as `audit_logs.ip_hash`, in hex; never the IP itself.
 */

// Cloudflare's ray ID, logged only when it looks like one (no log injection).
const CF_RAY = /^[A-Za-z0-9-]{1,64}$/

export default class AccessLogMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // Health probes run every few seconds; their failures log on their own.
    if (ctx.request.url().startsWith('/health/')) return next()
    const started = process.hrtime.bigint()
    try {
      return await next()
    } finally {
      const cfRay = ctx.request.header('cf-ray')
      const userId = (ctx as Partial<HttpContext>).auth?.user?.id
      ctx.logger.info(
        {
          method: ctx.request.method(),
          route: ctx.route?.pattern ?? null,
          route_name: ctx.route?.name ?? null,
          status: ctx.response.getStatus(),
          duration_ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
          ip_hash: keyedHash(hmacKeys.auditIp.release(), ctx.request.ip()).toString('hex'),
          ...(userId ? { user_id: userId } : {}),
          ...(cfRay && CF_RAY.test(cfRay) ? { cf_ray: cfRay } : {}),
        },
        'http.request'
      )
    }
  }
}

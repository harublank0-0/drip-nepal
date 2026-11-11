import { randomUUID } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/*
 * Request IDs (docs/06 §11, docs/09 §7.4 step 1). `request.id()` returns an
 * incoming `X-Request-Id` unchecked, and `ctx.logger` is bound to it before
 * any middleware runs. So this runs first among the server middleware (a
 * URL without a route never reaches the router middleware): an ID that fails
 * the allowlist is replaced with a fresh UUID, and the logger is rebuilt with
 * it. The response echo, the log lines and `problem.request_id` then agree.
 * A client's ID is for correlation only, never for security or idempotency.
 */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/

export default class RequestContextMiddleware {
  handle(ctx: HttpContext, next: NextFn) {
    const incoming = ctx.request.header('x-request-id')
    if (!incoming || !REQUEST_ID_PATTERN.test(incoming)) {
      const id = randomUUID()
      ctx.request.request.headers['x-request-id'] = id
      ctx.logger = logger.child({ request_id: id })
    }
    return next()
  }
}

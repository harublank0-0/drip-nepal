import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { DomainError } from '#exceptions/domain_error'

/*
 * Request body shape and size (docs/06 §9.2), in the router stack right
 * after the body parser and before the session, so a refused request
 * writes no session row and is refused whatever its CSRF token.
 *
 * - Multipart bodies are refused on every route (RF-35, ADR-0013): no R1
 *   operation accepts file bytes, and config/bodyparser.ts never processes
 *   them, so without this check the route would run with an empty body.
 *   06 §3.5 proposes a 400 code for this; until it is adopted the answer is
 *   422 `VALIDATION_FAILED` with the item code `unsupported_media_type`.
 * - A body the parser read (`request.raw()`) may be at most 256 KB, or the
 *   larger limit of its operation below; past it, 413 `PAYLOAD_TOO_LARGE`.
 *   The JSON, form and text parsers' own limit (512 KB, config/bodyparser.ts)
 *   refuses anything larger from its Content-Length, before reading it.
 */

const KB = 1024

export const DEFAULT_BODY_LIMIT_BYTES = 256 * KB

// Operations allowed more, by route name, which is the operationId (docs/09 §3.3).
export const BODY_LIMIT_BYTES_BY_OPERATION: Readonly<Record<string, number>> = {
  createProduct: 512 * KB,
  updateProduct: 512 * KB,
  replaceProductVariants: 512 * KB,
}

function mediaType(ctx: HttpContext) {
  return (ctx.request.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
}

export function bodyLimitFor(routeName: string | undefined) {
  if (routeName && Object.hasOwn(BODY_LIMIT_BYTES_BY_OPERATION, routeName)) {
    return BODY_LIMIT_BYTES_BY_OPERATION[routeName]
  }
  return DEFAULT_BODY_LIMIT_BYTES
}

export default class RequestBodyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (mediaType(ctx).startsWith('multipart/')) {
      throw new DomainError('VALIDATION_FAILED', {
        detail: 'Some fields need attention.',
        errors: [
          {
            field: null,
            code: 'unsupported_media_type',
            message: 'File uploads are not accepted here. Send JSON.',
          },
        ],
      })
    }

    const raw = ctx.request.raw()
    if (raw && Buffer.byteLength(raw, 'utf8') > bodyLimitFor(ctx.route?.name)) {
      throw new DomainError('PAYLOAD_TOO_LARGE', { detail: 'The request is too large.' })
    }

    return next()
  }
}

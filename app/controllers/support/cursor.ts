import { createHash } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'

/*
 * Cursor lists (docs/06 §6.2, §6.3). A list names its sort and its closed
 * parameter list; anything else in the query string, a `limit` outside 1 to
 * 100, or a cursor that does not decode, names another sort or was made for
 * other filters is 400 `INVALID_QUERY_PARAMETER`. The cursor is base64url of
 * `{"v":1,"s":"<sort>","k":[<sort value>,"<id>"],"f":"<8 hex>"}`, where `k`
 * is the last row's sort value (a timestamp as an RFC 3339 string with
 * microseconds) and ID, and `f` hashes the canonical filter set. Cursors are
 * not signed: a forged one only moves the start inside a query that is
 * already scoped to the caller.
 */

export type Seek = { key: string; id: string }

export type ListRequest = {
  limit: number
  seek: Seek | null
  meta: (last: Seek | null) => { limit: number; next_cursor: string | null }
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export function invalidParameter(parameter: string, message: string) {
  return new DomainError('INVALID_QUERY_PARAMETER', {
    detail: message,
    errors: [{ field: parameter, code: 'invalid', message }],
  })
}

// One query parameter, at most once.
function single(ctx: HttpContext, name: string): string | undefined {
  const value = ctx.request.qs()[name]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw invalidParameter(name, 'Send this parameter once.')
  return value
}

// A filter limited to `values`; `fallback` when it is absent.
export function oneOf<T extends string>(
  ctx: HttpContext,
  name: string,
  values: readonly T[],
  fallback?: T
): T | undefined {
  const value = single(ctx, name)
  if (value === undefined) return fallback
  if (!(values as readonly string[]).includes(value)) {
    throw invalidParameter(name, `Use one of: ${values.join(', ')}.`)
  }
  return value as T
}

export function uuidFilter(ctx: HttpContext, name: string) {
  const value = single(ctx, name)
  if (value !== undefined && !UUID.test(value)) throw invalidParameter(name, 'Send a UUID.')
  return value?.toLowerCase()
}

export function listRequest(
  ctx: HttpContext,
  spec: { sort: string; parameters: readonly string[]; filters: Record<string, unknown> }
): ListRequest {
  const known = new Set(['cursor', 'limit', ...spec.parameters])
  for (const name of Object.keys(ctx.request.qs())) {
    if (!known.has(name)) throw invalidParameter(name, 'Unknown query parameter.')
  }
  const limitText = single(ctx, 'limit')
  const limit = limitText === undefined ? 25 : Number(limitText)
  if (!/^\d{1,3}$/.test(limitText ?? '25') || limit < 1 || limit > 100) {
    throw invalidParameter('limit', 'Send a limit from 1 to 100.')
  }
  const canonical = Object.entries(spec.filters)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
  const f = createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 8)
  const cursorText = single(ctx, 'cursor')
  const seek = cursorText === undefined ? null : decode(cursorText, spec.sort, f)
  return {
    limit,
    seek,
    meta: (last) => ({
      limit,
      next_cursor: last
        ? Buffer.from(JSON.stringify({ v: 1, s: spec.sort, k: [last.key, last.id], f })).toString(
            'base64url'
          )
        : null,
    }),
  }
}

function decode(text: string, sort: string, f: string): Seek {
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
  } catch {
    throw invalidParameter('cursor', 'This cursor is not one this list made.')
  }
  const cursor = value as { v?: unknown; s?: unknown; k?: unknown; f?: unknown }
  const k = cursor.k
  if (
    cursor.v !== 1 ||
    cursor.s !== sort ||
    cursor.f !== f ||
    !Array.isArray(k) ||
    k.length !== 2 ||
    typeof k[0] !== 'string' ||
    k[0].length > 200 ||
    typeof k[1] !== 'string' ||
    !UUID.test(k[1])
  ) {
    throw invalidParameter(
      'cursor',
      'This cursor is not one this list made, or its filters changed.'
    )
  }
  return { key: k[0], id: k[1] }
}

/*
 * The problem+json body of a failed API call (docs/06 §5.1, ADR-0018), as
 * the browser reads it. The server's own type is app/exceptions/to_problem.ts;
 * this one carries no server code, so the client may import it (docs/09 §13.1).
 */
export type ProblemItem = { field: string | null; code: string; message: string }

export type Problem = {
  type: string
  title: string
  status: number
  code: string
  detail?: string
  request_id: string
  errors?: ProblemItem[]
  retry_after_seconds?: number
  [member: string]: unknown
}

export function isProblem(value: unknown): value is Problem {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.title === 'string'
  )
}

/*
 * The problem in a failed answer's body. Tuyau 1.2.2 parses a body only when
 * its type is exactly `application/json`, so a problem+json body reaches
 * `TuyauHTTPError.response` as text [Verified-repo `@tuyau/core`
 * `build/client/index.js`, `parseResponse`]; it is parsed here. A body that
 * is not a problem gives the fallback, so every failure has one shape.
 */
export function problemFrom(body: unknown, status: number | undefined): Problem {
  let value = body
  if (typeof body === 'string') {
    try {
      value = JSON.parse(body)
    } catch {
      value = null
    }
  }
  return isProblem(value) ? value : fallbackProblem(status)
}

/** A problem for an answer that is not problem+json. */
export function fallbackProblem(status: number | undefined): Problem {
  return {
    type: 'about:blank',
    title: 'Error',
    status: status ?? 500,
    code: 'INTERNAL',
    request_id: 'unavailable',
  }
}

/*
 * Server field errors for a form (docs/08 §7.1): an item whose dotted path
 * (`variants.2.sku`) names a field the form has goes under that field, in the
 * form's bracket notation (`variants[2].sku`); one with `field: null` or a
 * path the form lacks goes to the error summary. `message` picks the text:
 * the catalog's for the item's code when there is one, else the server's.
 */
export const toFormPath = (field: string) => field.replace(/\.(\d+)(?=\.|$)/g, '[$1]')

export function splitServerErrors(
  problem: Problem,
  known: ReadonlySet<string>,
  message: (item: ProblemItem) => string
) {
  const fields = new Map<string, string[]>()
  const formLevel: string[] = []
  for (const item of problem.errors ?? []) {
    const path = item.field === null ? null : toFormPath(item.field)
    if (path === null || !known.has(path)) {
      formLevel.push(message(item))
      continue
    }
    fields.set(path, [...(fields.get(path) ?? []), message(item)])
  }
  return { fields, formLevel }
}

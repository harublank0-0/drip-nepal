import { DomainError, type ProblemErrorItem } from '#exceptions/domain_error'
import { PROBLEM_CODES, problemType, type ProblemCode } from '#exceptions/problem_codes'
import { CONSTRAINT_MAP } from '#exceptions/constraint_map'
import { ProviderTimeoutError, ProviderUnavailableError } from '#exceptions/provider_errors'

/*
 * The single translation from a thrown error to an RFC 9457 problem
 * (docs/09 §5.4, docs/06 §5.3). A pure function over the error: it decides
 * the code from the source of the error, never from `error.status`, and it
 * never reads `error.message` except from a `DomainError`, whose message is
 * its title. Anything it does not recognise is 500 `INTERNAL` with a generic
 * detail, so no SQL, constraint name or stack reaches a client (RF-36).
 * T-API-012 feeds it one error of every source.
 */

export type Problem = {
  type: string
  title: string
  status: number
  detail: string
  code: ProblemCode
  request_id: string
  errors?: ProblemErrorItem[]
  retry_after_seconds?: number
  [member: string]: unknown
}

export type ProblemContext = {
  /*
   * For a CSRF failure: true when the session holds no signed-in user and
   * the matched route runs the `auth` middleware, which answers 401 instead
   * of 403 (docs/06 §4.1, docs/07 §3.3 row 2). The handler works it out.
   */
  signedOutOnProtectedRoute?: boolean
}

export const INTERNAL_DETAIL = 'Something went wrong. Quote the request ID to support.'

// The limits of docs/openapi.yaml `Problem` and `ProblemErrorItem`.
const MAX_ITEMS = 100
const MAX_FIELD = 200
const MAX_MESSAGE = 500
const ITEM_CODE = /^[a-z][a-z0-9_]{1,63}$/

// Members the registry owns; a DomainError extension can never replace them.
const CORE_MEMBERS = new Set(['type', 'title', 'status', 'detail', 'code', 'request_id'])

// The message @adonisjs/bodyparser 11.0.4 throws, with status 422 and no code,
// for a JSON body that is neither an object nor an array.
const STRICT_JSON_MESSAGE = 'Invalid JSON, only supports object and array'

// Seconds a client waits before retrying (docs/06 §5.2, §5.3).
const RETRY_AFTER = { lockTimeout: 2, provider: 30 } as const

type Build = {
  detail?: string
  errors?: ProblemErrorItem[]
  extensions?: Record<string, unknown>
  retryAfterSeconds?: number
}

function build(code: ProblemCode, requestId: string, options: Build = {}): Problem {
  const { status, title } = PROBLEM_CODES[code]
  const problem: Problem = {
    type: problemType(code),
    title,
    status,
    detail: options.detail ?? `${title}.`,
    code,
    request_id: requestId,
  }
  for (const [member, value] of Object.entries(options.extensions ?? {})) {
    if (!CORE_MEMBERS.has(member)) problem[member] = value
  }
  if (options.errors && options.errors.length > 0) {
    problem.errors = options.errors.slice(0, MAX_ITEMS)
  }
  if (options.retryAfterSeconds !== undefined) {
    problem.retry_after_seconds = Math.max(0, Math.ceil(options.retryAfterSeconds))
  }
  return problem
}

const item = (field: string | null, code: string, message: string): ProblemErrorItem => ({
  field,
  code,
  message,
})

function validationFailed(requestId: string, errors: ProblemErrorItem[]) {
  return build('VALIDATION_FAILED', requestId, { detail: 'Some fields need attention.', errors })
}

function internal(requestId: string) {
  return build('INTERNAL', requestId, { detail: INTERNAL_DETAIL })
}

// A Vine rule name as an item code: `minLength` → `min_length`.
function ruleCode(rule: unknown) {
  if (typeof rule !== 'string') return 'invalid'
  const code = rule.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  return ITEM_CODE.test(code) ? code : 'invalid'
}

function vineItems(messages: unknown[]): ProblemErrorItem[] {
  return messages.map((entry) => {
    const { field, rule, message } = (entry ?? {}) as Record<string, unknown>
    return item(
      typeof field === 'string' && field.length > 0 ? field.slice(0, MAX_FIELD) : null,
      ruleCode(rule),
      typeof message === 'string' ? message.slice(0, MAX_MESSAGE) : 'This value is not valid.'
    )
  })
}

type Fields = Record<string, unknown>
const fieldsOf = (error: unknown): Fields | null =>
  typeof error === 'object' && error !== null ? (error as Fields) : null

/*
 * A PostgreSQL error from `pg` (its `DatabaseError` fields): a five-character
 * SQLSTATE in `code` and a `severity`. Knex rethrows the same object with the
 * SQL text prepended to its message, which is one more reason never to send it.
 */
export function databaseError(error: unknown) {
  const fields = fieldsOf(error)
  if (!fields) return null
  const { code, severity, constraint } = fields
  if (typeof code !== 'string' || !/^[0-9A-Z]{5}$/.test(code) || typeof severity !== 'string') {
    return null
  }
  return { sqlstate: code, constraint: typeof constraint === 'string' ? constraint : null }
}

function fromDatabase(sqlstate: string, constraint: string | null, requestId: string) {
  if (sqlstate === '23505' || sqlstate === '23514') {
    const mapping = constraint ? CONSTRAINT_MAP[constraint] : undefined
    if (!mapping || mapping.sqlstate !== sqlstate) return internal(requestId)
    if ('code' in mapping) return build(mapping.code, requestId)
    return validationFailed(requestId, [item(mapping.field, mapping.item, mapping.message)])
  }
  switch (sqlstate) {
    // Value too long: it has no constraint name, so a validator has drifted
    // from a length CHECK (tech lead decision, 2026-10-01). Logged at `warn`.
    case '22001':
      return validationFailed(requestId, [item(null, 'max_length', 'A value is too long.')])
    // Lock timeout. `withIdempotency` turns one on its key insert into 409
    // `IDEMPOTENCY_IN_PROGRESS` before it gets here (docs/06 §5.3).
    case '55P03':
      return build('CONFLICT', requestId, {
        detail: 'Someone else is changing this right now. Try again in a moment.',
        retryAfterSeconds: RETRY_AFTER.lockTimeout,
      })
    // Deadlock after withTx's retry: a lock-order bug. Everything else too.
    default:
      return internal(requestId)
  }
}

export function toProblem(
  error: unknown,
  requestId: string,
  context: ProblemContext = {}
): Problem {
  if (error instanceof DomainError) {
    const { detail, errors, extensions, retryAfterSeconds } = error.options
    return build(error.problemCode, requestId, { detail, errors, extensions, retryAfterSeconds })
  }

  if (error instanceof ProviderUnavailableError || error instanceof ProviderTimeoutError) {
    return build('PROVIDER_UNAVAILABLE', requestId, {
      detail: 'A service we depend on is not answering. Try again shortly.',
      retryAfterSeconds: RETRY_AFTER.provider,
    })
  }

  // A JSON body that does not parse: the body parser sets status 400 on the SyntaxError.
  if (error instanceof SyntaxError && fieldsOf(error)?.status === 400) {
    return validationFailed(requestId, [
      item(null, 'malformed_json', 'The request body is not valid JSON.'),
    ])
  }

  const database = databaseError(error)
  if (database) return fromDatabase(database.sqlstate, database.constraint, requestId)

  const fields = fieldsOf(error)
  if (!fields) return internal(requestId)

  switch (fields.code) {
    case 'E_VALIDATION_ERROR':
      if (Array.isArray(fields.messages)) {
        return validationFailed(requestId, vineItems(fields.messages))
      }
      return internal(requestId)
    case 'E_UNAUTHORIZED_ACCESS':
      return build('UNAUTHENTICATED', requestId, { detail: 'Please log in to continue.' })
    case 'E_BAD_CSRF_TOKEN':
      if (context.signedOutOnProtectedRoute) {
        return build('UNAUTHENTICATED', requestId, { detail: 'Please log in to continue.' })
      }
      return build('FORBIDDEN', requestId, {
        detail: 'This page is out of date. Reload the page and try again.',
      })
    case 'E_ROUTE_NOT_FOUND':
      return build('NOT_FOUND', requestId, { detail: "We couldn't find that." })
    case 'E_TOO_MANY_REQUESTS': {
      const response = fieldsOf(fields.response)
      const seconds = typeof response?.availableIn === 'number' ? response.availableIn : 60
      return build('RATE_LIMITED', requestId, {
        detail: 'Too many attempts. Try again later.',
        retryAfterSeconds: Math.max(1, seconds),
      })
    }
  }

  // The body parser: the multipart limit (E_REQUEST_ENTITY_TOO_LARGE) and
  // raw-body's limit (type `entity.too.large`) are both 413.
  if (
    fields.status === 413 &&
    (fields.code === 'E_REQUEST_ENTITY_TOO_LARGE' || fields.type === 'entity.too.large')
  ) {
    return build('PAYLOAD_TOO_LARGE', requestId, { detail: 'The request is too large.' })
  }
  if (
    fields.status === 415 &&
    (fields.type === 'encoding.unsupported' || fields.type === 'charset.unsupported')
  ) {
    return validationFailed(requestId, [
      item(null, 'unsupported_media_type', 'The request body encoding is not supported.'),
    ])
  }
  if (fields.status === 422 && error instanceof Error && error.message === STRICT_JSON_MESSAGE) {
    return validationFailed(requestId, [
      item(null, 'malformed_json', 'The request body must be a JSON object.'),
    ])
  }

  return internal(requestId)
}

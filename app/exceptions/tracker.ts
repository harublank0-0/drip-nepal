import { databaseError } from '#exceptions/to_problem'
import { runtime } from '#config/runtime'

/*
 * The error-tracker hook (docs/09 §5.6, NFR-OBS-002). The exception handler
 * calls `reportToTracker` for every failure; only a 5xx is sent. What leaves
 * the process is built here, field by field, so nothing else can: the error's
 * class, message, stack and SQLSTATE or error code, and the tags below. Never
 * a request body, cookie, header, query string or the error's other members
 * (a `pg` error's `detail` quotes the row's values; the body parser puts the
 * raw body on its SyntaxError).
 *
 * The transport is a port. M0 ships none, so with no transport set (as in
 * development and tests) this is a no-op. The Sentry adapter and its
 * `bin/instrument.ts` arrive when `SENTRY_DSN` is provisioned (docs/11),
 * and only `setTrackerTransport` changes then.
 */

export type TrackerEvent = {
  error: { name: string; message: string; stack: string | null; code: string | null }
  tags: {
    request_id: string
    status: number
    route: string | null
    route_name: string | null
    release: string | null
    environment: string | null
    // HMAC-SHA256(HMAC_KEY_TELEMETRY, user_id) in hex, never the ID itself; null without the key.
    user_ref: string | null
  }
}

export interface TrackerTransport {
  capture(event: TrackerEvent): void | Promise<void>
}

let transport: TrackerTransport | null = null

export function setTrackerTransport(next: TrackerTransport | null) {
  transport = next
}

export type TrackerContext = Omit<TrackerEvent['tags'], 'release' | 'environment'>

const MAX_MESSAGE = 2000

// The stack's call frames, without the message lines above them.
function framesOf(stack: string) {
  const first = stack.indexOf('\n    at ')
  return first === -1 ? '' : stack.slice(first + 1)
}

/*
 * A PostgreSQL data exception (SQLSTATE class 22), reduced to what carries
 * no submitted value. Their server messages quote the value ("invalid input
 * syntax for type uuid: …", 22P02), so the message is dropped and replaced by
 * the SQLSTATE, the table, column and routine, and the SQL that Knex puts
 * before it, with numbered placeholders ($1) instead of values. The SQL is
 * kept only when the message starts with a statement keyword, cut at the
 * first " - ": SQL comes first and holds no value, so a cut there can only
 * shorten it, never reach the server's text. Every other class names objects,
 * not values, and is logged and sent in full, with `detail` redacted
 * (docs/09 §5.4, §7.2).
 */
const STATEMENT = /^(select|insert|update|delete|with|merge|copy|call)\b/i

export function scrubbedDatabaseError(error: unknown) {
  const database = databaseError(error)
  if (!database || !database.sqlstate.startsWith('22') || !(error instanceof Error)) return null
  const fields = error as Error & Record<string, unknown>
  const text = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string) : null)
  const separator = error.message.indexOf(' - ')
  const sql =
    separator !== -1 && STATEMENT.test(error.message)
      ? error.message.slice(0, separator).slice(0, MAX_MESSAGE)
      : null
  return {
    type: 'DatabaseError',
    sqlstate: database.sqlstate,
    constraint: database.constraint,
    table: text('table'),
    column: text('column'),
    routine: text('routine'),
    sql,
    stack: typeof error.stack === 'string' ? framesOf(error.stack) : null,
  }
}

export function trackerEvent(error: unknown, context: TrackerContext): TrackerEvent {
  const fields =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  const code = fields.code
  const database = scrubbedDatabaseError(error)
  const message = database
    ? `SQLSTATE ${database.sqlstate}${database.constraint ? ` on ${database.constraint}` : ''}${database.sql ? `: ${database.sql}` : ''}`
    : error instanceof Error
      ? error.message
      : 'Non-error value thrown'
  return {
    error: {
      name: error instanceof Error ? error.name : typeof error,
      message: message.slice(0, MAX_MESSAGE),
      stack: database
        ? database.stack
        : error instanceof Error && typeof error.stack === 'string'
          ? error.stack
          : null,
      code: typeof code === 'string' ? code : null,
    },
    tags: {
      ...context,
      release: runtime.release,
      // APP_ENV tells staging from production; both run NODE_ENV=production (docs/09 §6.1).
      environment: runtime.appEnv,
    },
  }
}

export type TrackerOutcome =
  | { outcome: 'sent' | 'skipped' }
  // The transport's error name and code, never its message or body.
  | { outcome: 'failed'; cause: { name: string; code: string | null } }

/*
 * Sends one event for a 5xx and nothing for anything else (T-ARCH-026).
 * A failing transport never replaces the error response: the failure is
 * returned for the handler to log, and nothing is thrown.
 */
export async function reportToTracker(
  error: unknown,
  context: TrackerContext
): Promise<TrackerOutcome> {
  if (!transport || context.status < 500) return { outcome: 'skipped' }
  try {
    await transport.capture(trackerEvent(error, context))
    return { outcome: 'sent' }
  } catch (failure) {
    const code = (failure as { code?: unknown } | null)?.code
    return {
      outcome: 'failed',
      cause: {
        name: failure instanceof Error ? failure.name : typeof failure,
        code: typeof code === 'string' ? code : null,
      },
    }
  }
}

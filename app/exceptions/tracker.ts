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
    // HMAC-SHA256(HMAC_KEY_TELEMETRY, user_id), never the ID itself; null until the key ring (E6).
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

/*
 * The SQL text Knex prepends to a database error's message carries no values
 * (they are bound as $1, $2), but a message can still be long; it is cut.
 */
const MAX_MESSAGE = 2000

export function trackerEvent(error: unknown, context: TrackerContext): TrackerEvent {
  const fields =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  const code = fields.code
  return {
    error: {
      name: error instanceof Error ? error.name : typeof error,
      message:
        error instanceof Error ? error.message.slice(0, MAX_MESSAGE) : 'Non-error value thrown',
      stack: error instanceof Error && typeof error.stack === 'string' ? error.stack : null,
      code: typeof code === 'string' ? code : null,
    },
    tags: {
      ...context,
      release: process.env.APP_RELEASE ?? null,
      environment: process.env.NODE_ENV ?? null,
    },
  }
}

// Sends one event for a 5xx and nothing for anything else (T-ARCH-026).
export async function reportToTracker(error: unknown, context: TrackerContext) {
  if (!transport || context.status < 500) return
  await transport.capture(trackerEvent(error, context))
}

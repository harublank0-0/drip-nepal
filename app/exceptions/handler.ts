import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { HttpError, StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'
import { databaseError, toProblem, type Problem } from '#exceptions/to_problem'
import { reportToTracker } from '#exceptions/tracker'

/*
 * The exception handler (docs/09 §5.4, ADR-0018). `toProblem()` is the one
 * translation point: an API request (`/api/…`) always answers problem+json,
 * and a page visit renders a status page or redirects. The default JSON
 * renderer is never reached for the API, because it sends `error.message`
 * (RF-36).
 */

const isApiRequest = (ctx: HttpContext) => ctx.request.url().startsWith('/api/')

// Codes that mean a client bug, logged at `warn` (docs/08 §8.3).
const CLIENT_BUG_CODES = new Set([
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'PRECONDITION_REQUIRED',
])

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

// The session key of the `web` session guard (config/auth.ts).
const SESSION_AUTH_KEY = 'auth_web'

/*
 * A CSRF failure answers 401 instead of 403 when the session holds no user
 * and the matched route runs the `auth` middleware: the session was revoked
 * or expired (docs/06 §4.1, docs/07 §3.3 row 2). Named middleware on a route
 * carry their `name` (@adonisjs/http-server 9.1.0 `middlewareReferenceBuilder`).
 */
function signedOutOnProtectedRoute(ctx: HttpContext) {
  const session = (ctx as Partial<HttpContext>).session
  if (!session || session.has(SESSION_AUTH_KEY)) return false
  for (const entry of ctx.route?.middleware.all() ?? []) {
    if ((entry as { name?: string }).name === 'auth') return true
  }
  return false
}

function problemFor(error: unknown, ctx: HttpContext): Problem {
  return toProblem(error, ctx.request.id() ?? 'unavailable', {
    signedOutOnProtectedRoute: signedOutOnProtectedRoute(ctx),
  })
}

export default class HttpExceptionHandler extends ExceptionHandler {
  // Youch pages only on a developer machine: tests and staging take the production path.
  protected debug = app.inDev
  protected renderStatusPages = !app.inDev

  // 403 gets `errors/forbidden` with the permission work of M1 (docs/08 §8.3).
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': (_, { inertia }) => inertia.render('errors/not_found', {}),
    '500..599': (_, { inertia, request }) =>
      inertia.render('errors/server_error', { request_id: request.id() ?? null }),
  }

  #sendProblem(problem: Problem, ctx: HttpContext) {
    if (problem.retry_after_seconds !== undefined) {
      ctx.response.header('Retry-After', String(problem.retry_after_seconds))
    }
    return ctx.response
      .status(problem.status)
      .header('Content-Type', 'application/problem+json; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .send(problem)
  }

  async handle(error: unknown, ctx: HttpContext) {
    const problem = problemFor(error, ctx)
    if (isApiRequest(ctx)) return this.#sendProblem(problem, ctx)
    // Pages: the account checks of docs/07 §3.3 throw these on GET visits too.
    if (problem.code === 'UNAUTHENTICATED') {
      return ctx.response.redirect().withQs({ return_to: ctx.request.url() }).toPath('/login')
    }
    if (problem.code === 'ACCOUNT_SUSPENDED') {
      ctx.session.flash('notice', 'account_suspended')
      return ctx.response.redirect().withQs(false).toPath('/login')
    }
    if (problem.code === 'MFA_REQUIRED') {
      return ctx.response.redirect().withQs({ return_to: ctx.request.url() }).toPath('/mfa')
    }
    // Status pages, the Inertia protocol and errors that handle themselves.
    return super.handle(error, ctx)
  }

  /*
   * The base renderers below would send `error.message` when a page URL is
   * asked for JSON, or for HTML with a status that has no status page. They
   * answer the problem, or its fixed title, instead (RF-36).
   */
  async renderErrorAsJSON(error: HttpError, ctx: HttpContext) {
    if (this.debug) return super.renderErrorAsJSON(error, ctx)
    this.#sendProblem(problemFor(error, ctx), ctx)
  }

  async renderErrorAsJSONAPI(error: HttpError, ctx: HttpContext) {
    if (this.debug) return super.renderErrorAsJSONAPI(error, ctx)
    this.#sendProblem(problemFor(error, ctx), ctx)
  }

  async renderErrorAsHTML(error: HttpError, ctx: HttpContext) {
    const hasStatusPage = error.status === 404 || error.status >= 500
    if (this.debug || (this.renderStatusPages && hasStatusPage)) {
      return super.renderErrorAsHTML(error, ctx)
    }
    const { title } = problemFor(error, ctx)
    ctx.response.status(error.status).send(`<p>${escapeHtml(title)}</p>`)
  }

  /*
   * Replaces the base report(), which logs 4xx at `warn`, skips 400, 401 and
   * 422 and decides by `error.status`. One `http.error` line per failure:
   * - 5xx at `error` with the full error, which only the logs ever see, and
   *   one tracker event;
   * - 503 `PROVIDER_UNAVAILABLE` (a provider outage or the kill switch) at
   *   `warn` and not tracked: degraded but handled, and an outage would send
   *   one event per checkout (docs/09 §5.1, §5.6);
   * - 4xx at `info`, except the client-bug codes and a 22001 (value too long,
   *   a validator no longer mirrors a length CHECK) at `warn` (docs/06 §5.3).
   */
  async report(error: unknown, ctx: HttpContext) {
    const problem = problemFor(error, ctx)
    const database = databaseError(error)
    const handled = problem.code === 'PROVIDER_UNAVAILABLE'
    const level =
      problem.status >= 500 && !handled
        ? 'error'
        : handled || CLIENT_BUG_CODES.has(problem.code) || database?.sqlstate === '22001'
          ? 'warn'
          : 'info'
    ctx.logger.log(
      level,
      {
        problem_code: problem.code,
        status: problem.status,
        ...(database ? { sqlstate: database.sqlstate } : {}),
        ...(level === 'error' ? { err: error } : {}),
      },
      'http.error'
    )
    if (handled) return
    await reportToTracker(error, {
      request_id: problem.request_id,
      status: problem.status,
      route: ctx.route?.pattern ?? null,
      route_name: ctx.route?.name ?? null,
      user_ref: null,
    })
  }
}

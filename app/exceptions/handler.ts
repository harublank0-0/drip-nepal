import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { HttpError, StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'
import { databaseError, toProblem, type Problem } from '#exceptions/to_problem'
import { reportToTracker, scrubbedDatabaseError } from '#exceptions/tracker'

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

// A page error's answer when no Inertia page can render it.
const titlePage = (problem: Problem) => `<p>${escapeHtml(problem.title)}</p>`

/*
 * Status pages render through Inertia, which an error thrown before the
 * Inertia middleware (static files, CORS, Vite) has not set up; those get the
 * title alone.
 */
function renderPage(
  ctx: HttpContext,
  error: HttpError,
  render: (inertia: HttpContext['inertia']) => unknown
) {
  const inertia = (ctx as Partial<HttpContext>).inertia
  if (inertia) return render(inertia)
  // The status page's error is the handler's shim: the problem's title and status.
  return `<p>${escapeHtml(error.message)}</p>`
}

/*
 * The redirect of a page visit that needs a sign-in: the visited URL, query
 * included, travels only as `return_to`, never forwarded as the target's own
 * query string (config/app.ts forwards it by default; docs/09 §5.4).
 */
function signInRedirect(ctx: HttpContext, path: '/login' | '/mfa') {
  return ctx.response
    .redirect()
    .withQs(false)
    .withQs({ return_to: ctx.request.url(true) })
    .toPath(path)
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
    '404': (error, ctx) =>
      renderPage(ctx, error, (inertia) => inertia.render('errors/not_found', {})),
    '500..599': (error, ctx) =>
      renderPage(ctx, error, (inertia) =>
        inertia.render('errors/server_error', { request_id: ctx.request.id() ?? null })
      ),
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
      return signInRedirect(ctx, '/login')
    }
    if (problem.code === 'ACCOUNT_SUSPENDED') {
      ;(ctx as Partial<HttpContext>).session?.flash('notice', 'account_suspended')
      return ctx.response.redirect().withQs(false).toPath('/login')
    }
    if (problem.code === 'MFA_REQUIRED') {
      return signInRedirect(ctx, '/mfa')
    }
    // Status pages, the Inertia protocol and errors that handle themselves.
    return super.handle(error, ctx)
  }

  /*
   * The base renderers below would send `error.message`, or Vine's raw
   * messages with their `meta`, when a page URL is asked for JSON, and would
   * trust `error.status` for HTML. They answer from the problem instead: its
   * status picks the status page, and a status without one shows the title
   * (RF-36).
   */
  async renderErrorAsJSON(error: HttpError, ctx: HttpContext) {
    if (this.debug) return super.renderErrorAsJSON(error, ctx)
    this.#sendProblem(problemFor(error, ctx), ctx)
  }

  async renderErrorAsJSONAPI(error: HttpError, ctx: HttpContext) {
    if (this.debug) return super.renderErrorAsJSONAPI(error, ctx)
    this.#sendProblem(problemFor(error, ctx), ctx)
  }

  async renderValidationErrorAsJSON(error: HttpError, ctx: HttpContext) {
    if (this.debug) return super.renderValidationErrorAsJSON(error, ctx)
    this.#sendProblem(problemFor(error, ctx), ctx)
  }

  async renderValidationErrorAsJSONAPI(error: HttpError, ctx: HttpContext) {
    if (this.debug) return super.renderValidationErrorAsJSONAPI(error, ctx)
    this.#sendProblem(problemFor(error, ctx), ctx)
  }

  async renderErrorAsHTML(error: HttpError, ctx: HttpContext) {
    if (this.debug) return super.renderErrorAsHTML(error, ctx)
    const problem = problemFor(error, ctx)
    const hasStatusPage = problem.status === 404 || (problem.status >= 500 && problem.status < 600)
    if (this.renderStatusPages && hasStatusPage) {
      // The base renderer picks the page by `status`; it gets the problem's, and only the title.
      const shim = Object.assign(new Error(problem.title), { status: problem.status })
      return super.renderErrorAsHTML(shim as HttpError, ctx)
    }
    ctx.response.status(problem.status).send(titlePage(problem))
  }

  /*
   * Replaces the base report(), which logs 4xx at `warn`, skips 400, 401 and
   * 422 and decides by `error.status`. One `http.error` line per failure:
   * - 5xx at `error` with the error, and one tracker event;
   * - 503 `PROVIDER_UNAVAILABLE` (a provider outage or the kill switch) at
   *   `warn` and not tracked: degraded but handled, and an outage would send
   *   one event per checkout (docs/09 §5.1, §5.6);
   * - `warn` for the client-bug codes, a lock timeout (55P03) and a value too
   *   long (22001: a validator no longer mirrors a length CHECK; the line
   *   carries the statement, since PostgreSQL names no column) (docs/09 §7.3,
   *   docs/06 §5.3);
   * - other 4xx at `info`.
   * A data exception (SQLSTATE class 22) is logged reduced, since its server
   * message quotes the submitted value; every other error in full, with
   * `detail` redacted by the logger (docs/09 §5.4, §7.2).
   */
  async report(error: unknown, ctx: HttpContext) {
    const problem = problemFor(error, ctx)
    const database = databaseError(error)
    const handled = problem.code === 'PROVIDER_UNAVAILABLE'
    const warned =
      handled ||
      CLIENT_BUG_CODES.has(problem.code) ||
      database?.sqlstate === '22001' ||
      database?.sqlstate === '55P03'
    const level = problem.status >= 500 && !handled ? 'error' : warned ? 'warn' : 'info'
    const withError = level === 'error' || database?.sqlstate === '22001'
    ctx.logger.log(
      level,
      {
        problem_code: problem.code,
        status: problem.status,
        route: ctx.route?.pattern ?? null,
        ...(database ? { sqlstate: database.sqlstate } : {}),
        ...(withError ? { err: scrubbedDatabaseError(error) ?? error } : {}),
      },
      'http.error'
    )
    if (handled) return
    const tracked = await reportToTracker(error, {
      request_id: problem.request_id,
      status: problem.status,
      route: ctx.route?.pattern ?? null,
      route_name: ctx.route?.name ?? null,
      user_ref: null,
    })
    if (tracked.outcome === 'failed') {
      ctx.logger.warn({ problem_code: problem.code, cause: tracked.cause }, 'tracker.failed')
    }
  }
}

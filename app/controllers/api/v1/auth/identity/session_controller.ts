import type { HttpContext } from '@adonisjs/core/http'
import { endSession, startSession } from '#controllers/support/session'
import { auditIpHash } from '#modules/audit/actions/record_audit'
import { logIn } from '#modules/identity/actions/log_in'
import { safeReturnPath } from '#modules/identity/queries'
import { sessionUserJson } from '#transformers/identity/account_transformer'
import { assertKnownMembers } from '#validators/support/strict_keys'
import { LOG_IN_MEMBERS, logInValidator } from '#validators/identity/log_in'

/*
 * Signing in and out (docs/06 §13.3; 01 FR-IAM-003; M1 part 3). The routes
 * are in start/routes/api_v1/auth.ts, named by their operationIds.
 *
 * `logIn` runs behind `guest` (a signed-in caller gets 409 `CONFLICT`,
 * docs/09 §3.4 row 3). The identity action checks the password and the
 * account status; only then does `startSession` forget the earlier
 * sign-in's keys, call the guard's `login()` (a new session ID), put the
 * stamp and the login times and tag the new row (docs/07 §3.1, §3.2). The
 * answer's `redirect_to` is `return_to` checked by the helper of docs/07
 * TM-14, or `/`; the page navigates only to it.
 *
 * `logOut` runs behind `auth`: `endSession` logs out, untags, clears and
 * regenerates the session, so the old row is deleted and the old cookie
 * finds nothing (docs/07 §3.11, AC-FR-IAM-003-6). Its 204 cannot clear the
 * browser's history; the client does (`router.clearHistory()`), and the
 * `/login` page it visits next renders with `clearHistory` too.
 */
export default class SessionController {
  // logIn: 200 `{ data: { user, redirect_to } }`; one 401 for a wrong password or an unknown email.
  async logIn(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), LOG_IN_MEMBERS)
    const input = await ctx.request.validateUsing(logInValidator)
    const result = await logIn(
      { email: input.email, password: input.password },
      {
        ip: ctx.request.ip(),
        requestId: ctx.request.id() ?? null,
        ipHash: auditIpHash(ctx.request.ip()),
      }
    )
    await startSession(ctx, result.user, result.securityStamp)

    const returnTo = input.return_to ?? null
    const redirectTo = safeReturnPath(returnTo)
    // TM-14's detective control: the length only, never the value, which may carry a token.
    if (returnTo !== null && redirectTo === null) {
      ctx.logger.info({ return_to_length: returnTo.length }, 'auth.return_to_rejected')
    }
    return { data: { user: sessionUserJson(result.user), redirect_to: redirectTo ?? '/' } }
  }

  // logOut: 204; the session row is gone and the cookie names a new, empty session.
  async logOut(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), [])
    await endSession(ctx)
    return ctx.response.noContent()
  }
}

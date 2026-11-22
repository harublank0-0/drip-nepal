import type { HttpContext } from '@adonisjs/core/http'

/*
 * The password-reset pages (docs/08 §2.3; 02 J-18 steps 1–4; M1 part 4),
 * server-rendered in the auth layout (ADR-0003). GET only: the forms write
 * through `requestPasswordReset` and `resetPassword` (ADR-0004). Routes in
 * start/routes/auth.ts.
 *
 * Both open signed in or not, like `/verify-email`, rather than behind
 * `guest`, which docs/09 §3.4 allows on them: the emailed link may be
 * opened on any device, and `guest` would send a signed-in visitor to `/`
 * without the token; and a signed-in user who forgot the password cannot
 * use `changePassword`, which asks for it. Neither page has props of its
 * own.
 */
export default class PasswordResetController {
  // `/forgot-password`: the email field; the same confirmation whatever the address.
  async forgotPassword(ctx: HttpContext) {
    return ctx.inertia.render('auth/forgot_password', {})
  }

  /*
   * `/reset-password`, which the reset email links as `?token=…`. This GET
   * never reads or redeems the token: the page posts it with the new
   * password and drops it from the URL, so a mail scanner that fetches the
   * link changes nothing. A token page sends no referrer (docs/07 TM-14,
   * §7.3) and is never stored by a browser or a cache, because its answer
   * holds the token URL in the page object (07 §7.3, docs/03 §12.5).
   */
  async resetPassword(ctx: HttpContext) {
    ctx.response.header('Referrer-Policy', 'no-referrer')
    ctx.response.header('Cache-Control', 'no-store')
    return ctx.inertia.render('auth/reset_password', {})
  }
}

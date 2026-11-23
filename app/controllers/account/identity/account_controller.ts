import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { ownAccount } from '#modules/identity/queries'
import { profileProps } from '#transformers/identity/account_transformer'

/*
 * The account pages of docs/08 §2.4 built in M1 part 6a, behind `auth`,
 * rendered in the browser in the account layout (ADR-0003,
 * config/inertia.ts) with encrypted history (docs/07 §3.11). GET only: the
 * forms write through `updateMe`, `changePassword`, `revokeAllSessions` and
 * `requestAccountDeletion` (ADR-0004). Routes in start/routes/account.ts.
 * A `pending_verification` user may use both (docs/07 §4.4, AC-FR-IAM-002-2);
 * a suspended or closed account never gets here (07 §3.3 row 1).
 *
 * Each answer holds personal data, so it is never stored (`private,
 * no-store`, docs/07 §3.11, docs/03 §12.5).
 */
export default class AccountController {
  /*
   * `/account`: the profile form (`updateMe`). Its one prop, `account`, is
   * the profile as the form needs it: the email (shown, not editable), the
   * name, the status (for the "verify your email" notice), the phone's last
   * four digits and the two consents as booleans; never the phone itself
   * (docs/07 §5.5, T-SEC-036).
   */
  async overview(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'private, no-store')
    const account = await ownAccount(ctx.auth.getUserOrFail().id)
    // `auth` has just loaded the row; a delete in between is a session without an account.
    if (!account) throw new DomainError('UNAUTHENTICATED')
    return ctx.inertia.render('account/overview', { account: profileProps(account) })
  }

  /*
   * `/account/security`: change password, sign out of other devices and the
   * deletion request. No props of its own: the forms need nothing beyond the
   * shared `user`.
   */
  async security(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'private, no-store')
    return ctx.inertia.render('account/security', {})
  }
}

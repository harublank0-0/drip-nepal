import type { HttpContext } from '@adonisjs/core/http'
import { endSession } from '#controllers/support/session'
import { DomainError } from '#exceptions/domain_error'
import { auditIpHash } from '#modules/audit/actions/record_audit'
import { requestAccountDeletion } from '#modules/identity/actions/request_account_deletion'
import { updateMe } from '#modules/identity/actions/update_me'
import { ownAccount } from '#modules/identity/queries'
import { shopsOfUser } from '#modules/shops/queries'
import { meJson } from '#transformers/identity/account_transformer'
import { assertKnownMembers, assertNotNull } from '#validators/support/strict_keys'
import {
  REQUEST_ACCOUNT_DELETION_MEMBERS,
  requestAccountDeletionValidator,
} from '#validators/identity/request_account_deletion'
import { UPDATE_ME_MEMBERS, updateMeValidator } from '#validators/identity/update_me'

/*
 * The signed-in user's own account (docs/06 §13.3), behind `auth`. Only the
 * caller's own row, so there is no ID to change; nothing secret leaves (the
 * account transformer lists every member). Routes in
 * start/routes/api_v1/auth.ts, named by their operationIds.
 *
 * - `getMe` (M1 part 3): read with identity's and shops' queries, as a page
 *   controller reads its props (docs/09 §3.5).
 * - `updateMe` (M1 part 6a): refuses unknown members, validates, calls the
 *   identity action with the stamp the account check has just compared
 *   (docs/07 §3.3), then answers the account as `getMe` does.
 * - `requestAccountDeletion` (M1 part 6a): the identity action closes the
 *   account; this session then ends here, as `logOut` ends one (docs/07
 *   §3.11), and the identity job ends the others. The `notice` flash,
 *   written into the new guest session, is what `/login`, which the client
 *   visits next, shows (docs/08 §2.3); it carries no account data.
 */
export default class MeController {
  async getMe(ctx: HttpContext) {
    return { data: await accountOf(ctx.auth.getUserOrFail().id) }
  }

  // updateMe: 200 with the account after the change.
  async updateMe(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), UPDATE_ME_MEMBERS)
    // The name and the consents may be left out, never sent as null or `""`;
    // `phone: null` (or `""`, which the body parser makes null) removes the number.
    assertNotNull(ctx.request.body(), [
      'full_name',
      'marketing_email_consent',
      'marketing_sms_consent',
    ])
    const input = await ctx.request.validateUsing(updateMeValidator)
    const user = ctx.auth.getUserOrFail()
    await updateMe(
      user.id,
      {
        fullName: input.full_name,
        phoneE164: input.phone,
        marketingEmailConsent: input.marketing_email_consent,
        marketingSmsConsent: input.marketing_sms_consent,
        sessionStamp: user.securityStamp,
      },
      { requestId: ctx.request.id() ?? null, ipHash: auditIpHash(ctx.request.ip()) }
    )
    return { data: await accountOf(user.id) }
  }

  // requestAccountDeletion: 202; the account is closed and this session has ended.
  async requestAccountDeletion(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), REQUEST_ACCOUNT_DELETION_MEMBERS)
    const input = await ctx.request.validateUsing(requestAccountDeletionValidator)
    const user = ctx.auth.getUserOrFail()
    const result = await requestAccountDeletion(
      user.id,
      { password: input.password, sessionStamp: user.securityStamp },
      { requestId: ctx.request.id() ?? null, ipHash: auditIpHash(ctx.request.ip()) }
    )
    await endSession(ctx)
    ctx.session.flash('notice', 'deletion_requested')
    return ctx.response.accepted({ data: { status: result.status } })
  }
}

// The caller's account as `getMe` answers it, with the shops they own or work in.
async function accountOf(userId: string) {
  const account = await ownAccount(userId)
  // `auth` has just loaded the row; a delete in between is a session without an account.
  if (!account) throw new DomainError('UNAUTHENTICATED')
  const shops = await shopsOfUser(userId)
  return meJson(account, shops)
}

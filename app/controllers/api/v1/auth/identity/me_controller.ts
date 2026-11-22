import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { ownAccount } from '#modules/identity/queries'
import { shopsOfUser } from '#modules/shops/queries'
import { meJson } from '#transformers/identity/account_transformer'

/*
 * `getMe` (docs/06 §13.3; M1 part 3), behind `auth`: the signed-in user's
 * own account, read with identity's and shops' queries, as a page
 * controller reads its props (docs/09 §3.5). Only the caller's own row, so
 * there is no ID to change; nothing secret leaves (the account transformer
 * lists every member).
 */
export default class MeController {
  async getMe(ctx: HttpContext) {
    const userId = ctx.auth.getUserOrFail().id
    const account = await ownAccount(userId)
    // `auth` has just loaded the row; a delete in between is a session without an account.
    if (!account) throw new DomainError('UNAUTHENTICATED')
    const shops = await shopsOfUser(userId)
    return { data: meJson(account, shops) }
  }
}

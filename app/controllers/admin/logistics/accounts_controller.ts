import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { listRequest, type ListRequest } from '#controllers/support/cursor'
import { listAccounts } from '#modules/logistics/queries'
import { shopLabels, shopsNeedingCode } from '#modules/shops/queries'
import { adminAccountJson } from '#transformers/courier_transformer'

/*
 * The admin courier accounts page, `/admin/logistics` (docs/08 §2.6, §3.1
 * "Courier operations"; page requirement `platform.logistics.manage`,
 * docs/07 §4.5). It reads what `adminListLogisticsAccounts` reads, one
 * cursor page at a time, with each shop's slug and name, and whether a
 * status change on a shop-owned account needs a `totp_code` from this staff
 * member (OD-44's exception, R1-S part 1c-ii). An unknown or
 * malformed query parameter (a stale cursor, a tracking tag) redirects to
 * the page without its query instead of an error page (docs/08 §7.2). GET
 * only.
 */
export default class AccountsController {
  async index(ctx: HttpContext) {
    let list: ListRequest
    try {
      list = listRequest(ctx, {
        sort: 'created_at',
        keyKind: 'timestamp',
        parameters: [],
        filters: {},
      })
    } catch (error) {
      if (error instanceof DomainError && error.problemCode === 'INVALID_QUERY_PARAMETER') {
        return ctx.response.redirect().withQs(false).toRoute('admin.logistics')
      }
      throw error
    }
    const result = await listAccounts({ limit: list.limit, seek: list.seek })
    const shopIds = result.accounts.flatMap((account) => [
      ...(account.shopId === null ? [] : [account.shopId]),
      ...account.shops.map((link) => link.shopId),
    ])
    const labels = await shopLabels(shopIds)
    const codeShops = await shopsNeedingCode(
      ctx.staff.userId,
      result.accounts.flatMap((account) => (account.shopId === null ? [] : [account.shopId]))
    )
    return ctx.inertia.render('admin/logistics', {
      accounts: {
        items: result.accounts.map((account) => adminAccountJson(account, labels, codeShops)),
        meta: list.meta(result.last),
      },
    })
  }
}

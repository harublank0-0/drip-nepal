import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { closedQuery } from '#controllers/support/cursor'
import { setEtag } from '#controllers/support/http'
import { assertShopGate } from '#modules/shops/permissions'
import { sellerShop, shopsOfUser } from '#modules/shops/queries'
import { myShopJson } from '#transformers/seller/seller_context_transformer'
import { sellerShopJson } from '#transformers/seller/shop_transformer'

/*
 * The seller's own shops (docs/06 §13.5; R1-S part 1a). Routes in
 * start/routes/api_v1/seller.ts, named by their operationIds. Neither takes
 * a query parameter (06 §6.3: any is 400 `INVALID_QUERY_PARAMETER`); both
 * are charged to `api_user` (06 §9.1).
 *
 * - `listMyShops` (`session`, outside `{shopSlug}` and `seller_context`,
 *   docs/07 §4.5): the shops the caller owns, in any status, and those they
 *   are an `active` member of, with their place in each; the same rows as
 *   the `seller_shops` shared prop. A bounded list (06 §6.2 "Bounded
 *   lists"): `{ data: [...] }` without `meta` or a cursor.
 * - `getSellerShop` (`shop.member` behind `seller_context`, which answers
 *   another shop's slug with the 404 of an unknown one, T-SEC-001): the
 *   status gate of docs/07 §4.4 for `shop.member` routes (owner only while
 *   `pending_review` or `rejected`, refused when `closed`), then the profile
 *   with the owner-only members for the owner alone (AC-FR-SHOP-013-4) and
 *   the `version` as a strong ETag (06 §8), which `updateShopProfile` will
 *   take as `If-Match`.
 */
export default class ShopsController {
  async listMyShops(ctx: HttpContext) {
    closedQuery(ctx, [])
    const shops = await shopsOfUser(ctx.auth.getUserOrFail().id)
    return { data: shops.map(myShopJson) }
  }

  async getSellerShop(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertShopGate(ctx.shop, 'member')
    const row = await sellerShop(ctx.shop.id)
    // `seller_context` has just found the shop; shops are never deleted while members remain.
    if (!row) throw new DomainError('NOT_FOUND')
    setEtag(ctx, row.version)
    return { data: sellerShopJson(row, ctx.shop.actor) }
  }
}

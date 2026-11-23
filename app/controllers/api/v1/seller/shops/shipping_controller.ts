import type { HttpContext } from '@adonisjs/core/http'
import { closedQuery } from '#controllers/support/cursor'
import { expectedVersion, sellerActor, setEtag } from '#controllers/support/http'
import { replaceShopShipping } from '#modules/shops/actions/replace_shop_shipping'
import { assertShopGate, assertShopPermission } from '#modules/shops/permissions'
import { shopShippingState } from '#modules/shops/queries'
import { shopShippingJson } from '#transformers/seller/shipping_transformer'
import {
  assertKnownItemMembers,
  assertKnownMembers,
  assertNotNull,
} from '#validators/support/strict_keys'
import {
  RATE_MEMBERS,
  SHIPPING_MEMBERS,
  replaceShopShippingValidator,
} from '#validators/shops/replace_shop_shipping'

/*
 * A shop's delivery coverage, zone rates and estimates (docs/06 §13.5;
 * 01 FR-SHOP-004; R1-S part 1c). Routes in start/routes/api_v1/seller.ts,
 * named by their operationIds, behind `auth` and `seller_context`, which
 * answers another shop's slug with the 404 of an unknown one (T-SEC-001).
 * Neither takes a query parameter (06 §6.3: any is 400
 * `INVALID_QUERY_PARAMETER`; the validator reads the body and the query
 * merged, so a member could otherwise arrive in the query). Both are
 * charged to `api_user` (06 §9.1 gives them no row of their own).
 *
 * - `getShopShipping` (`shop.member`): the status gate of docs/07 §4.4 for
 *   `shop.member` routes (open in `active` and both suspension modes, to
 *   the owner only while `pending_review` or `rejected`, OD-47; refused when
 *   `closed`), then the coverage, the rates, `configured` and the `version`
 *   (`shops.version`) as a strong ETag (06 §8).
 * - `replaceShopShipping` ⟳ (`shop.shipping.manage`): the permission, then
 *   the "profile, shipping" status gate (owner only while `pending_review`
 *   or `rejected`, refused while `suspended` or `closed`), then the members:
 *   an unknown one, top-level or in a rate, is 422 `unknown_field`
 *   (T-SEC-003), a null 422 `required`; then the validator, then `If-Match`
 *   (428 when missing). The action locks the shop, checks the gate and the
 *   version again and answers 200 with the shipping as `getShopShipping`
 *   shows it, with the new ETag.
 */
export default class ShippingController {
  async show(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertShopGate(ctx.shop, 'member')
    const state = await shopShippingState(ctx.shop.id)
    setEtag(ctx, state.version)
    return { data: shopShippingJson(state) }
  }

  async replace(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertShopPermission(ctx.shop, 'shop.shipping.manage')
    assertShopGate(ctx.shop, 'profile')
    const body = ctx.request.body()
    assertKnownMembers(body, SHIPPING_MEMBERS)
    assertNotNull(body, SHIPPING_MEMBERS)
    assertKnownItemMembers(body, 'rates', RATE_MEMBERS)
    const input = await ctx.request.validateUsing(replaceShopShippingValidator)
    const version = expectedVersion(ctx)
    const shipping = await replaceShopShipping(
      {
        shop: ctx.shop,
        expectedVersion: version,
        changes: {
          coverage: input.coverage,
          rates: input.rates?.map((rate) => ({
            zoneCode: rate.zone_code,
            feeMinor: rate.fee_minor,
            estMinDays: rate.est_min_days,
            estMaxDays: rate.est_max_days,
          })),
        },
      },
      { actor: sellerActor(ctx), present: shopShippingJson }
    )
    setEtag(ctx, shipping.version)
    return { data: shipping }
  }
}

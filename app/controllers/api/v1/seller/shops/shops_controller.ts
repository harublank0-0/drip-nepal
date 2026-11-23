import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { closedQuery } from '#controllers/support/cursor'
import { expectedVersion, sellerActor, setEtag } from '#controllers/support/http'
import { updateShopProfile } from '#modules/shops/actions/update_shop_profile'
import { assertShopGate, assertShopOwner, assertShopPermission } from '#modules/shops/permissions'
import { sellerShop, shopsOfUser } from '#modules/shops/queries'
import { myShopJson } from '#transformers/seller/seller_context_transformer'
import { sellerShopJson } from '#transformers/seller/shop_transformer'
import { assertKnownMembers, assertNotNull } from '#validators/support/strict_keys'
import {
  NOT_NULL_MEMBERS,
  OWNER_ONLY_PROFILE_MEMBERS,
  SHOP_PROFILE_MEMBERS,
  updateShopProfileValidator,
} from '#validators/shops/update_shop_profile'

/*
 * The seller's own shops (docs/06 §13.5; R1-S parts 1a and 1b). Routes in
 * start/routes/api_v1/seller.ts, named by their operationIds. None takes a
 * query parameter (06 §6.3: any is 400 `INVALID_QUERY_PARAMETER`; the
 * validator reads the body and the query merged, so a member could
 * otherwise arrive in the query). The reads are charged to `api_user`
 * (06 §9.1); `updateShopProfile` to its own `shop_profile_update` row, in
 * the API limits middleware before any check here, so a refused call takes
 * a point too.
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
 *   the `version` as a strong ETag (06 §8), which `updateShopProfile` takes
 *   as `If-Match`.
 * - `updateShopProfile` ⟳ (`shop.profile.manage`): the permission, then the
 *   "profile, shipping" status gate of 07 §4.4 (owner only while
 *   `pending_review` or `rejected`, refused while `suspended` or `closed`),
 *   then the members: an unknown one is 422 `unknown_field` (T-SEC-003), an
 *   owner-only one from a member who is not the owner 403 `FORBIDDEN`, a
 *   null where none is allowed 422 `required`; then the validator, then
 *   `If-Match` (428 when missing). The action locks the row, checks the gate
 *   and the version again and answers 200 with the shop as `getSellerShop`
 *   shows it to the caller, with the new ETag.
 */
const OWNER_ONLY_DETAIL =
  'Only the shop’s owner can change the business details, the return policy and the grievance contact.'

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

  async updateShopProfile(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertShopPermission(ctx.shop, 'shop.profile.manage')
    assertShopGate(ctx.shop, 'profile')
    const body = ctx.request.body()
    assertKnownMembers(body, SHOP_PROFILE_MEMBERS)
    if (OWNER_ONLY_PROFILE_MEMBERS.some((member) => Object.hasOwn(body, member))) {
      assertShopOwner(ctx.shop, OWNER_ONLY_DETAIL)
    }
    assertNotNull(body, NOT_NULL_MEMBERS)
    const input = await ctx.request.validateUsing(updateShopProfileValidator)
    const version = expectedVersion(ctx)
    const actor = ctx.shop.actor
    const shop = await updateShopProfile(
      {
        shop: ctx.shop,
        expectedVersion: version,
        changes: {
          description: input.description,
          contactEmail: input.contact_email,
          contactPhoneE164: input.contact_phone,
          returnPolicyText: input.return_policy_text,
          businessType: input.business_type,
          registrationNumber: input.registration_number,
          registrationAuthority: input.registration_authority,
          panVatNumber: input.pan_vat_number,
          isVatRegistered: input.is_vat_registered,
          grievanceContactName: input.grievance_contact_name,
          grievanceContactPhoneE164: input.grievance_contact_phone,
        },
      },
      { actor: sellerActor(ctx), present: (row) => sellerShopJson(row, actor) }
    )
    setEtag(ctx, shop.version)
    return { data: shop }
  }
}

import type { SellerContext, UserShop } from '#modules/shops/queries'
import { shopPermissions } from '#modules/shops/permissions'

/*
 * The seller shell's shapes (docs/03 §6.3, docs/09 §13.7), each listing
 * its members:
 * - `myShopJson`: one row of `listMyShops` and of the `seller_shops`
 *   shared prop, the shops a user owns or is an active member of: slug,
 *   name, status and the user's place in it. Never a shop ID or another
 *   member.
 * - `currentShopJson`: the `current_shop` shared prop of a seller page,
 *   from the shop `seller_context` resolved: slug, name, status,
 *   `suspension_mode`, the caller's role and the permissions that role
 *   holds in the docs/07 §4.3 map, so the sidebar hides what the role
 *   cannot use. The UI hides; the server decides (docs/08 §11.6).
 */
export function myShopJson(shop: UserShop) {
  return { slug: shop.slug, name: shop.name, status: shop.status, role: shop.role }
}

export function currentShopJson(shop: SellerContext) {
  return {
    slug: shop.slug,
    name: shop.name,
    status: shop.status,
    suspension_mode: shop.suspensionMode,
    role: shop.actor,
    permissions: shopPermissions(shop.actor),
  }
}

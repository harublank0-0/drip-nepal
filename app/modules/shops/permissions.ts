import { DomainError } from '#exceptions/domain_error'
import { memberRoutesOpen, profileEditable } from '#shared/ui/shop_access'
import type { SellerActor, SellerContext } from '#modules/shops/queries'

/*
 * The shop permissions of docs/07 §4.3 (role map) and the shop status gates
 * of docs/07 §4.4. An actor is the shop's owner or an active member's role.
 * The map is 07 §4.3 as written, so no slug is invented (AGENTS.md); R1-S
 * part 1a brought the whole map for the seller pages' `current_shop`
 * permissions (docs/09 §13.7), where M6 held only the courier slugs.
 */
export const SHOP_PERMISSIONS = {
  'shop.profile.manage': ['owner', 'manager'],
  'shop.shipping.manage': ['owner', 'manager'],
  'shop.staff.manage': ['owner'],
  'shop.payout_account.manage': ['owner'],
  // Proposed with M6 (OD-56): owner only, with password re-entry (07 §3.10).
  'shop.courier_accounts.manage': ['owner'],
  'shop.products.view': ['owner', 'manager', 'catalog_editor', 'order_fulfiller', 'viewer'],
  'shop.products.edit': ['owner', 'manager', 'catalog_editor'],
  'shop.products.publish': ['owner', 'manager', 'catalog_editor'],
  'shop.inventory.adjust': ['owner', 'manager', 'catalog_editor'],
  'shop.orders.view': ['owner', 'manager', 'order_fulfiller', 'viewer'],
  'shop.orders.process': ['owner', 'manager', 'order_fulfiller'],
  // The viewer sees customer contact in masked form only (07 §4.3), which is not this permission.
  'shop.customer_contact.view': ['owner', 'manager', 'order_fulfiller'],
  'shop.finance.view': ['owner', 'manager'],
} as const

export type ShopPermission = keyof typeof SHOP_PERMISSIONS

export function shopMay(actor: SellerActor, permission: ShopPermission) {
  return (SHOP_PERMISSIONS[permission] as readonly string[]).includes(actor)
}

/** Every permission `actor` holds, in the map's order, for `current_shop` (docs/09 §13.7). */
export function shopPermissions(actor: SellerActor): ShopPermission[] {
  return (Object.keys(SHOP_PERMISSIONS) as ShopPermission[]).filter((permission) =>
    shopMay(actor, permission)
  )
}

export function assertShopPermission(shop: SellerContext, permission: ShopPermission) {
  if (!shopMay(shop.actor, permission)) throw new DomainError('FORBIDDEN')
}

/*
 * An owner-only part of an operation that a permission slug does not name
 * (docs/07 §4.3): a member who is not the owner gets 403 `FORBIDDEN` with
 * `detail` saying what only the owner may do.
 */
export function assertShopOwner(shop: SellerContext, detail: string) {
  if (shop.actor !== 'owner') throw new DomainError('FORBIDDEN', { detail })
}

/*
 * The 07 §4.4 columns the built operations follow:
 * - `member`, the routes that declare `shop.member` (`getSellerShop` and the
 *   `/seller/{shopSlug}` overview and settings pages; proposed, OD-48): open
 *   in `active` and in both suspension modes, to the owner only in
 *   `pending_review` and `rejected`, refused in `closed` (`memberRoutesOpen`,
 *   which the seller UI's links share);
 * - `profile`, the "profile, shipping" column for `updateShopProfile` and
 *   `replaceShopShipping`: open in `active`, to the owner only in
 *   `pending_review` and `rejected` (OD-47 for shipping), refused while
 *   `suspended` or `closed` (`profileEditable`, which the settings and
 *   shipping pages share; R1-S parts 1b and 1c);
 * - courier accounts like the payout account (active only);
 * - `logistics`, the logistics settings and pickup addresses: the "profile,
 *   shipping" column without its `pending_review` and `rejected` cell,
 *   which allows named operations only (`getShopShipping` and
 *   `replaceShopShipping` among them, not these), so active only;
 * - courier booking like orders process (active, or suspended in
 *   `fulfill_existing` mode);
 * - `products_view` (`listShopProducts`, `getShopProduct`): active, or
 *   suspended in either mode; refused while `pending_review`, `rejected`
 *   or `closed` (R1-S part 2a);
 * - `products_edit`, the "products edit, publish; inventory" column
 *   (`createProduct`, `updateProduct`): active only.
 */
export type ShopGate =
  | 'member'
  | 'profile'
  | 'courier_accounts'
  | 'logistics'
  | 'orders_process'
  | 'products_view'
  | 'products_edit'

export function shopGateAllows(shop: SellerContext, gate: ShopGate) {
  switch (gate) {
    case 'member':
      return memberRoutesOpen(shop.status, shop.actor)
    case 'profile':
      return profileEditable(shop.status, shop.actor)
    case 'orders_process':
      return (
        shop.status === 'active' ||
        (shop.status === 'suspended' && shop.suspensionMode === 'fulfill_existing')
      )
    case 'products_view':
      return shop.status === 'active' || shop.status === 'suspended'
    case 'courier_accounts':
    case 'logistics':
    case 'products_edit':
      return shop.status === 'active'
  }
}

export function assertShopGate(shop: SellerContext, gate: ShopGate) {
  if (!shopGateAllows(shop, gate)) {
    throw new DomainError('SHOP_NOT_ACTIVE', {
      extensions: { shop_status: shop.status, suspension_mode: shop.suspensionMode },
    })
  }
}

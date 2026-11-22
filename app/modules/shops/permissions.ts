import { DomainError } from '#exceptions/domain_error'
import type { SellerContext } from '#modules/shops/queries'

/*
 * The shop permissions the M6 courier operations need (docs/07 §4.3 role
 * map, §4.5 operation map) and the shop status gates of docs/07 §4.4. M2
 * brings the full map; this holds only the slugs M6 schedules, as 07 lists
 * them, so no slug is invented (AGENTS.md). An actor is the shop's owner or
 * an active member's role.
 */
export const SHOP_PERMISSIONS = {
  'shop.shipping.manage': ['owner', 'manager'],
  // Proposed with M6 (OD-56): owner only, with password re-entry (07 §3.10).
  'shop.courier_accounts.manage': ['owner'],
  'shop.orders.process': ['owner', 'manager', 'order_fulfiller'],
} as const

export type ShopPermission = keyof typeof SHOP_PERMISSIONS

export function assertShopPermission(shop: SellerContext, permission: ShopPermission) {
  if (!(SHOP_PERMISSIONS[permission] as readonly string[]).includes(shop.actor)) {
    throw new DomainError('FORBIDDEN')
  }
}

/*
 * The 07 §4.4 columns the courier operations follow: courier accounts like
 * the payout account (active only); logistics settings and pickup addresses
 * like the profile and shipping column (active only); courier booking like
 * orders process (active, or suspended in `fulfill_existing` mode).
 */
export type ShopGate = 'courier_accounts' | 'shipping' | 'orders_process'

export function assertShopGate(shop: SellerContext, gate: ShopGate) {
  const allowed =
    shop.status === 'active' ||
    (gate === 'orders_process' &&
      shop.status === 'suspended' &&
      shop.suspensionMode === 'fulfill_existing')
  if (!allowed) {
    throw new DomainError('SHOP_NOT_ACTIVE', {
      extensions: { shop_status: shop.status, suspension_mode: shop.suspensionMode },
    })
  }
}

/*
 * `shop_memberships.role` (docs/04a §6.2) and `shop_invitations.role`
 * (docs/04a §6.3): the values of `shop_memberships_role_check`, in its order.
 * T-ARCH-011 fails if the two differ (docs/04 §2.4). Permissions per role:
 * docs/07 §4.3.
 */
export const SHOP_MEMBER_ROLES = ['manager', 'catalog_editor', 'order_fulfiller', 'viewer'] as const
export type ShopMemberRole = (typeof SHOP_MEMBER_ROLES)[number]

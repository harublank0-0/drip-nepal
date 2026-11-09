/*
 * `shop_memberships.status` (docs/04a §6.2): the values of
 * `shop_memberships_status_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const SHOP_MEMBERSHIP_STATUSES = ['active', 'removed'] as const
export type ShopMembershipStatus = (typeof SHOP_MEMBERSHIP_STATUSES)[number]

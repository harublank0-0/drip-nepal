/*
 * `shops.suspension_mode` (docs/04a §6.1) and
 * `shop_review_decisions.suspension_mode` (docs/04a §6.5): the values of
 * `shops_suspension_mode_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4). docs/07 §4.4.
 */
export const SUSPENSION_MODES = ['fulfill_existing', 'frozen'] as const
export type SuspensionMode = (typeof SUSPENSION_MODES)[number]

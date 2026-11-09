/*
 * `shop_review_decisions.decision` (docs/04a §6.5): the values of
 * `shop_review_decisions_decision_check`, in its order. T-ARCH-011 fails if
 * the two differ (docs/04 §2.4).
 */
export const SHOP_REVIEW_DECISIONS = ['approved', 'rejected', 'suspended', 'reinstated'] as const
export type ShopReviewDecision = (typeof SHOP_REVIEW_DECISIONS)[number]

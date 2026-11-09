/*
 * `product_review_decisions.decision` (docs/04a §7.11): the values of
 * `product_review_decisions_decision_check`, in its order. T-ARCH-011 fails
 * if the two differ (docs/04 §2.4).
 */
export const PRODUCT_REVIEW_DECISIONS = ['approved', 'rejected', 'blocked', 'unblocked'] as const
export type ProductReviewDecision = (typeof PRODUCT_REVIEW_DECISIONS)[number]

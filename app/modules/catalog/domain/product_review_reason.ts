/*
 * `product_review_decisions.reason_code` (docs/04a §7.11): the values of
 * `product_review_decisions_reason_code_check`, in its order. T-ARCH-011
 * fails if the two differ (docs/04 §2.4).
 */
export const PRODUCT_REVIEW_REASONS = [
  'counterfeit_suspected',
  'misleading_claim',
  'prohibited_item',
  'missing_disclosure',
  'poor_images',
  'other',
] as const
export type ProductReviewReason = (typeof PRODUCT_REVIEW_REASONS)[number]

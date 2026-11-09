/*
 * `orders.verification_method` (docs/04a §11.1): the values of
 * `orders_verification_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4). OD-57; null while `verification_status` is
 * `pending`.
 */
export const ORDER_VERIFICATION_METHODS = ['phone_call', 'sms_otp', 'manual'] as const
export type OrderVerificationMethod = (typeof ORDER_VERIFICATION_METHODS)[number]

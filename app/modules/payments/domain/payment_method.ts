/*
 * `payments.method` (docs/04a §12.1) and `orders.payment_method` (docs/04a
 * §11.1), which list the same values: those of `payments_method_check`, in
 * its order. T-ARCH-011 fails if they differ (docs/04 §2.4).
 */
export const PAYMENT_METHODS = ['cod', 'esewa', 'khalti'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

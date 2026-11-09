/*
 * `payments.method` (docs/04a §12.1) and `orders.payment_method` (docs/04a
 * §11.1): the values of `payments_method_check`, in its order. T-ARCH-011
 * fails if the two differ (docs/04 §2.4). `orders.payment_method` (docs/04a
 * §11.1) lists the same values.
 */
export const PAYMENT_METHODS = ['cod', 'esewa', 'khalti'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

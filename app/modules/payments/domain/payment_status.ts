/*
 * `payments.status` (docs/04a §12.1) of a cash-on-delivery payment: the first
 * list of `payments_status_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const COD_PAYMENT_STATUSES = [
  'awaiting_collection',
  'collected',
  'not_collected',
  'cancelled',
] as const
export type CodPaymentStatus = (typeof COD_PAYMENT_STATUSES)[number]

/*
 * `payments.status` of an eSewa or Khalti payment (R1.1): the second list of
 * `payments_status_check`, in its order.
 */
export const GATEWAY_PAYMENT_STATUSES = [
  'initiated',
  'pending',
  'captured',
  'failed',
  'expired',
  'cancelled',
  'needs_review',
] as const
export type GatewayPaymentStatus = (typeof GATEWAY_PAYMENT_STATUSES)[number]

export type PaymentStatus = CodPaymentStatus | GatewayPaymentStatus

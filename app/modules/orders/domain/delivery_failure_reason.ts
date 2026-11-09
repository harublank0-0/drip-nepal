/*
 * `shipment_events.reason_code` (docs/04a §11.6): the values of
 * `shipment_events_reason_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4). Set exactly on a `delivery_failed` event.
 */
export const DELIVERY_FAILURE_REASONS = [
  'customer_unreachable',
  'refused',
  'address_problem',
  'other',
] as const
export type DeliveryFailureReason = (typeof DELIVERY_FAILURE_REASONS)[number]

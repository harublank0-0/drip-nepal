/*
 * `courier_events.mapped_status` (docs/04a §9.14): the normalised shipment
 * statuses a courier update can lead to, in the order of
 * `courier_events_mapped_status_check`. They are a subset of
 * `shipments.status` (docs/04a §11.5); the orders module decides whether the
 * shipment machine allows the transition (docs/05 §6.3).
 */
export const COURIER_MAPPED_STATUSES = [
  'booked',
  'shipped',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returning',
  'cancelled',
] as const
export type CourierMappedStatus = (typeof COURIER_MAPPED_STATUSES)[number]

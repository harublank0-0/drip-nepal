/*
 * `shipments.status` (docs/04a §11.5): the values of
 * `shipments_status_check`, in its order. T-ARCH-011 fails if the two differ
 * (docs/04 §2.4). Transitions: docs/05 §6.3. `shipment_events.status` holds
 * the status an event leads to (docs/04a §11.6).
 */
export const SHIPMENT_STATUSES = [
  'pending',
  'packed',
  'booking_requested',
  'booked',
  'booking_failed',
  'needs_reconciliation',
  'shipped',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returning',
  'returned_to_origin',
  'cancelled',
] as const
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

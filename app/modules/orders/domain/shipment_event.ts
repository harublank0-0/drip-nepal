/*
 * `shipment_events.event` (docs/04a §11.6): the values of
 * `shipment_events_event_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const SHIPMENT_EVENTS = [
  'packed',
  'shipped',
  'delivered',
  'delivery_failed',
  'reattempt',
  'returning',
  'returned_to_origin',
  'booking_requested',
  'booked',
  'booking_failed',
  'needs_reconciliation',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'cancelled',
] as const
export type ShipmentEvent = (typeof SHIPMENT_EVENTS)[number]

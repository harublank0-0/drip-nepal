import { defineMachine } from '#modules/platform/state_machine'
import type { ShipmentStatus } from '#modules/orders/domain/shipment_status'

/*
 * The shipment machines of docs/05 §6.3. The courier path: the vendor books,
 * the courier confirms, refuses or leaves the outcome unknown, picks the
 * parcel up and reports its way; the vendor still records the return to
 * origin. The manual path's own transitions arrive with
 * `recordFulfillmentEvent`.
 */
export const COURIER_SHIPMENT = defineMachine<ShipmentStatus>('shipment_courier', [
  ['pending', 'booking_requested'],
  ['packed', 'booking_requested'],
  ['booking_requested', 'booked'],
  ['booking_requested', 'booking_failed'],
  ['booking_requested', 'needs_reconciliation'],
  ['needs_reconciliation', 'booked'],
  ['needs_reconciliation', 'booking_failed'],
  ['booking_failed', 'cancelled'],
  ['booked', 'cancelled'],
  ['booked', 'shipped'],
  ['shipped', 'out_for_delivery'],
  ['shipped', 'delivered'],
  ['out_for_delivery', 'delivered'],
  ['shipped', 'delivery_failed'],
  ['out_for_delivery', 'delivery_failed'],
  ['delivery_failed', 'out_for_delivery'],
  ['delivery_failed', 'returning'],
  ['returning', 'returned_to_origin'],
])

// Statuses in which the parcel still needs its courier account (docs/04a §9.9).
export const UNFINISHED_COURIER_STATUSES = [
  'booking_requested',
  'needs_reconciliation',
  'booked',
  'shipped',
  'out_for_delivery',
  'delivery_failed',
  'returning',
] as const

// Statuses the tracking poll reads (docs/04a §11.5 `shipments_account_idx`).
export const MOVING_COURIER_STATUSES = [
  'booked',
  'shipped',
  'out_for_delivery',
  'delivery_failed',
  'returning',
] as const

// Most delivery attempts (A-47).
export const MAX_DELIVERY_ATTEMPTS = 3

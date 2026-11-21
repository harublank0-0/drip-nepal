/*
 * The queues the `orders` module hosts for the courier path (docs/03 §9,
 * M6; payloads carry identifiers only). The booking and status jobs live
 * here because they apply shipment transitions; they reach the courier only
 * through `logistics` (docs/09 §2.3 rule 3).
 *
 * - `orders.book_courier_shipment`: sent in the booking transaction.
 * - `orders.process_courier_event`: reads a parcel's history and replays it;
 *   sent by the callback receiver, the poll, a staff refresh or resolution,
 *   and the lost-event sweeper. `courier_event_id` is the trigger row, if any.
 * - `orders.poll_courier_statuses`, `orders.sweep_courier_bookings`,
 *   `orders.sweep_courier_events`: scheduled.
 */
declare module '#modules/platform/jobs' {
  interface JobPayloads {
    'orders.book_courier_shipment': { shipment_id: string; shop_id: string }
    'orders.process_courier_event': {
      shipment_id: string
      shop_id: string
      courier_event_id: string | null
    }
    'orders.poll_courier_statuses': Record<string, never>
    'orders.sweep_courier_bookings': Record<string, never>
    'orders.sweep_courier_events': Record<string, never>
  }
}

export {}

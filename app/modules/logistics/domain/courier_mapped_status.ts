/*
 * `courier_events.mapped_status` (docs/04a §9.14): the normalised shipment
 * statuses a courier reading can lead to. They are a subset of
 * `shipments.status`, whose array is the orders module's (docs/04 §2.4: a
 * subset has no array of its own); `logistics` may not import `orders`
 * (docs/09 §2.2), so this is a type only. The orders module decides
 * whether the shipment machine allows the transition (docs/05 §6.3).
 */
export type CourierMappedStatus =
  | 'booked'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_failed'
  | 'returning'
  | 'cancelled'

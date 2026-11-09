/*
 * `shipment_events.actor_type` (docs/04a §11.6): the values of
 * `shipment_events_actor_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const SHIPMENT_EVENT_ACTOR_TYPES = [
  'shop_member',
  'platform_staff',
  'system',
  'provider',
] as const
export type ShipmentEventActorType = (typeof SHIPMENT_EVENT_ACTOR_TYPES)[number]

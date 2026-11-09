/*
 * `order_events.visibility` (docs/04a §11.4): the values of
 * `order_events_visibility_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const ORDER_EVENT_VISIBILITIES = ['customer', 'shop', 'internal'] as const
export type OrderEventVisibility = (typeof ORDER_EVENT_VISIBILITIES)[number]

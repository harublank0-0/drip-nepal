/*
 * `courier_events.source` (docs/04a §9.14): the values of
 * `courier_events_source_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const COURIER_EVENT_SOURCES = ['callback', 'poll', 'history'] as const
export type CourierEventSource = (typeof COURIER_EVENT_SOURCES)[number]

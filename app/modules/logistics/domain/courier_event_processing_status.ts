/*
 * `courier_events.processing_status` (docs/04a §9.14): the values of
 * `courier_events_processing_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const COURIER_EVENT_PROCESSING_STATUSES = [
  'pending',
  'looked_up',
  'applied',
  'ignored',
  'held',
  'failed',
] as const
export type CourierEventProcessingStatus = (typeof COURIER_EVENT_PROCESSING_STATUSES)[number]

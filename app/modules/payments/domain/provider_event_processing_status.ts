/*
 * `provider_events.processing_status` (docs/04a §12.3): the values of
 * `provider_events_processing_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const PROVIDER_EVENT_PROCESSING_STATUSES = [
  'pending',
  'processed',
  'ignored',
  'failed',
] as const
export type ProviderEventProcessingStatus = (typeof PROVIDER_EVENT_PROCESSING_STATUSES)[number]

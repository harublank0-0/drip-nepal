/*
 * `provider_events.kind` (docs/04a §12.3): the values of
 * `provider_events_kind_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const PROVIDER_EVENT_KINDS = [
  'initiate',
  'return',
  'webhook',
  'lookup',
  'refund',
  'refund_lookup',
] as const
export type ProviderEventKind = (typeof PROVIDER_EVENT_KINDS)[number]

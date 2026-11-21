/*
 * `courier_events.hold_reason` (docs/04a §9.14): the values of
 * `courier_events_hold_reason_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const COURIER_EVENT_HOLD_REASONS = [
  'not_allowed',
  'terminal_shop_order',
  'cod_collected',
  'unmapped_status',
  'return_check_failed',
] as const
export type CourierEventHoldReason = (typeof COURIER_EVENT_HOLD_REASONS)[number]

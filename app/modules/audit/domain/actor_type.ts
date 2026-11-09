/*
 * `audit_logs.actor_type` (docs/04a §15.3) and `order_events.actor_type`
 * (docs/04a §11.4): the values of `audit_logs_actor_type_check`, in its
 * order. T-ARCH-011 fails if the two differ (docs/04 §2.4).
 * `order_events.actor_type` (docs/04a §11.4) lists the same values.
 */
export const ACTOR_TYPES = [
  'customer',
  'shop_member',
  'platform_staff',
  'system',
  'provider',
] as const
export type ActorType = (typeof ACTOR_TYPES)[number]

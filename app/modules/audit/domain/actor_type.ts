/*
 * `audit_logs.actor_type` (docs/04a §15.3) and `order_events.actor_type`
 * (docs/04a §11.4), which list the same values: those of
 * `audit_logs_actor_type_check`, in its order. T-ARCH-011 fails if they
 * differ (docs/04 §2.4).
 */
export const ACTOR_TYPES = [
  'customer',
  'shop_member',
  'platform_staff',
  'system',
  'provider',
] as const
export type ActorType = (typeof ACTOR_TYPES)[number]

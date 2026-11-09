/*
 * `idempotency_keys.status` (docs/04a §15.2): the values of
 * `idempotency_keys_status_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4). Always `completed` in R1: the row commits with the operation (docs/06 §7).
 */
export const IDEMPOTENCY_KEY_STATUSES = ['completed'] as const
export type IdempotencyKeyStatus = (typeof IDEMPOTENCY_KEY_STATUSES)[number]

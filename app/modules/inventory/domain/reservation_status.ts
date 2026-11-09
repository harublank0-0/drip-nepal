/*
 * `inventory_reservations.status` (docs/04a §8.2): the values of
 * `inventory_reservations_status_check`, in its order. T-ARCH-011 fails if
 * the two differ (docs/04 §2.4). Transitions: docs/05 §5.
 */
export const RESERVATION_STATUSES = ['held', 'committed', 'released', 'consumed'] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

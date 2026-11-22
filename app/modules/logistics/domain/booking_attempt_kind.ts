/*
 * `shipment_booking_attempts.kind` (docs/04a §9.13): the values of
 * `shipment_booking_attempts_kind_check`, in its order. T-ARCH-011 fails if
 * the two differ (docs/04 §2.4).
 */
export const BOOKING_ATTEMPT_KINDS = ['book', 'cancel', 'reference_lookup'] as const
export type BookingAttemptKind = (typeof BOOKING_ATTEMPT_KINDS)[number]

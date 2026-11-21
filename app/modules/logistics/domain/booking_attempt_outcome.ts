/*
 * `shipment_booking_attempts.outcome` (docs/04a §9.13): the values of
 * `shipment_booking_attempts_outcome_check`, in its order. T-ARCH-011 fails
 * if the two differ (docs/04 §2.4).
 */
export const BOOKING_ATTEMPT_OUTCOMES = ['pending', 'succeeded', 'refused', 'unknown'] as const
export type BookingAttemptOutcome = (typeof BOOKING_ATTEMPT_OUTCOMES)[number]

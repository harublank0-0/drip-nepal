/*
 * `provider_events.provider` (docs/04a §12.3): the values of
 * `provider_events_provider_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const PAYMENT_PROVIDERS = ['esewa', 'khalti'] as const
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number]

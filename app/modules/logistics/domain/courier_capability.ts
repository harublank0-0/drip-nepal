/*
 * The members of `logistics_providers.capabilities` (docs/04a §9.8): what a
 * courier adapter supports. A member that is missing is `false`. The rules
 * that depend on them are in docs/05 §6.3 ("What the courier supports").
 */
export const COURIER_CAPABILITIES = [
  'booking',
  'cancellation',
  'tracking_callback',
  'tracking_poll',
  'cod',
  'reference_lookup',
  'signed_callback',
  'branches',
] as const
export type CourierCapability = (typeof COURIER_CAPABILITIES)[number]
export type CourierCapabilities = Record<CourierCapability, boolean>

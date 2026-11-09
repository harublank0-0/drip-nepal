/*
 * `attributes.input` (docs/04a §7.2): the values of `attributes_input_check`,
 * in its order. T-ARCH-011 fails if the two differ (docs/04 §2.4).
 */
export const ATTRIBUTE_INPUTS = ['single', 'multi'] as const
export type AttributeInput = (typeof ATTRIBUTE_INPUTS)[number]

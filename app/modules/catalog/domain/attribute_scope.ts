/*
 * `attributes.scope` (docs/04a §7.2): the values of `attributes_scope_check`,
 * in its order. T-ARCH-011 fails if the two differ (docs/04 §2.4).
 */
export const ATTRIBUTE_SCOPES = ['product', 'variant'] as const
export type AttributeScope = (typeof ATTRIBUTE_SCOPES)[number]

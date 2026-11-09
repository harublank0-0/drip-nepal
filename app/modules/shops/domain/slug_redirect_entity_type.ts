/*
 * `slug_redirects.entity_type` (docs/04a §6.10): the values of
 * `slug_redirects_entity_type_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4).
 */
export const SLUG_REDIRECT_ENTITY_TYPES = ['shop', 'category'] as const
export type SlugRedirectEntityType = (typeof SLUG_REDIRECT_ENTITY_TYPES)[number]

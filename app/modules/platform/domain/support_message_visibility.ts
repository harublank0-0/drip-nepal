/*
 * `support_case_messages.visibility` (docs/04a §14.2): the values of
 * `support_case_messages_visibility_check`, in its order. T-ARCH-011 fails if
 * the two differ (docs/04 §2.4).
 */
export const SUPPORT_MESSAGE_VISIBILITIES = ['customer', 'shop', 'internal'] as const
export type SupportMessageVisibility = (typeof SUPPORT_MESSAGE_VISIBILITIES)[number]

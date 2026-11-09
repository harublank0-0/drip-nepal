/*
 * `support_case_messages.author_type` (docs/04a §14.2): the values of
 * `support_case_messages_author_type_check`, in its order. T-ARCH-011 fails
 * if the two differ (docs/04 §2.4).
 */
export const SUPPORT_MESSAGE_AUTHOR_TYPES = [
  'customer',
  'shop_member',
  'platform_staff',
  'system',
] as const
export type SupportMessageAuthorType = (typeof SUPPORT_MESSAGE_AUTHOR_TYPES)[number]

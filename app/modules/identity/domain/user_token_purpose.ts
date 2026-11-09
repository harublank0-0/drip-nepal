/*
 * `user_tokens.purpose` (docs/04a §5.2): the values of
 * `user_tokens_purpose_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const USER_TOKEN_PURPOSES = [
  'email_verification',
  'password_reset',
  'mfa_enrollment',
] as const
export type UserTokenPurpose = (typeof USER_TOKEN_PURPOSES)[number]

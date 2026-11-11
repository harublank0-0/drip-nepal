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

/*
 * How long a token of each purpose lives, owned by docs/07 §3.8
 * [Assumption there]: 24 h for email verification and MFA enrolment, 60
 * minutes for a password reset (AC-FR-IAM-004-2). `user_tokens_expiry_check`
 * allows at most 7 days.
 */
export const USER_TOKEN_LIFETIME_SECONDS: Record<UserTokenPurpose, number> = {
  email_verification: 24 * 60 * 60,
  password_reset: 60 * 60,
  mfa_enrollment: 24 * 60 * 60,
}

/*
 * The email templates (docs/04a §14.3 `notification_deliveries.template`,
 * docs/09 §11.2). Each name matches `notification_deliveries_template_check`
 * and has two Edge files under resources/views/emails/, at the name with
 * its dots as folders: `identity.password_reset` is
 * `emails/identity/password_reset.html.edge`, the HTML part, and
 * `emails/identity/password_reset.text.edge`, the plain-text part
 * (AC-FR-NOT-001-3). Its English text is in resources/lang/en/emails.json
 * under the same name, and `<name>.subject` is the subject.
 *
 * - `identity.password_reset`: a `password_reset` token's link to
 *   `/reset-password`. The invitation of `platform:create-admin` is such a
 *   token (docs/09 §9.1), so the copy reads for both.
 * - `identity.mfa_enrollment`: an `mfa_enrollment` token's link to `/mfa`
 *   (docs/07 §3.9).
 * - `identity.email_verification`: an `email_verification` token's link to
 *   `/verify-email` (docs/08 §2.3; 02 J-04 step 4), sent by `signUp` and
 *   `resendEmailVerification`.
 * - `identity.account_exists`: the "account already exists" notice of a
 *   signup with a registered email (AC-FR-IAM-001-2), with a link to
 *   `/login` and no token.
 */
export const EMAIL_TEMPLATES = [
  'identity.password_reset',
  'identity.mfa_enrollment',
  'identity.email_verification',
  'identity.account_exists',
] as const
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number]

export const isEmailTemplate = (value: string): value is EmailTemplate =>
  (EMAIL_TEMPLATES as readonly string[]).includes(value)

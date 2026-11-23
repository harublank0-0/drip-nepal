import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'
import { nepalMobile } from '#validators/support/nepal_mobile'
import { nfcText } from '#validators/support/nfc_text'

/*
 * `updateMe` (docs/06 §13.3; 01 FR-IAM-013). The members are the whole
 * input, each optional: anything else, `email`, `status`, `security_stamp`,
 * a password or a role included, is refused with `unknown_field` before
 * this runs (`assertKnownMembers`, RF-36, T-SEC-003). No operation changes
 * the login email in R1 (docs/11 §14.6).
 *
 * - `full_name`: trimmed and normalised to NFC first, then 1 to 100 code
 *   points, as at sign-up (`nfcText`); never null, because only an
 *   anonymised row may lack a name (`users_identity_required_check`).
 * - `phone`: a Nepali mobile number, handed on in E.164 (`nepalMobile`), or
 *   null to remove the number.
 * - `marketing_email_consent`, `marketing_sms_consent`: strict booleans
 *   (AC-FR-IAM-013-1); `"on"` or `1` answer `boolean`.
 */
export const UPDATE_ME_MEMBERS = [
  'full_name',
  'phone',
  'marketing_email_consent',
  'marketing_sms_consent',
] as const

export const updateMeValidator = vine.create({
  full_name: nfcText(ACCOUNT_LIMITS.fullName).optional(),
  phone: nepalMobile().nullable().optional(),
  marketing_email_consent: vine.boolean({ strict: true }).optional(),
  marketing_sms_consent: vine.boolean({ strict: true }).optional(),
})

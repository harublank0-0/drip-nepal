import vine from '@vinejs/vine'
import { accountEmail } from '#validators/support/account_email'
import { nepalMobile } from '#validators/support/nepal_mobile'
import { nfcText } from '#validators/support/nfc_text'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'

// A box that must be ticked: `false` is refused with the item code `accepted`.
const ticked = vine.createRule((value, _options, field) => {
  if (value !== true) field.report('The {{ field }} field must be ticked', 'accepted', field)
})

/*
 * `signUp` (docs/06 §13.3; 01 FR-IAM-001, FR-IAM-013). The members are the
 * whole input: anything else, `status`, `email_verified_at`,
 * `security_stamp` or a role included, is refused with `unknown_field`
 * before this runs (`assertKnownMembers`, RF-36, T-SEC-003).
 *
 * - `email`: the shared account email rule (trimmed, lower-cased, at most
 *   254 characters, never in `.invalid`; RF-22, T-IAM-112).
 * - `password`: 10 to 128 characters, no composition rule, never trimmed
 *   (docs/07 §3.7 [Assumption A-22], RF-12).
 * - `full_name`: trimmed and normalised to NFC first, then 1 to 100 code
 *   points, as `users_full_name_check` counts them (docs/04 §2.8); NFC can
 *   lengthen Devanagari, so the order matters (`nfcText`).
 * - `phone`: optional; a Nepali mobile number, handed on in E.164.
 * - `age_confirmed`: the unticked 18+ confirmation, which must be the JSON
 *   value `true` (A-26; OD-24, decided 2026-11-22 for the build): a strict
 *   boolean, so `"on"`, `"yes"` or `1` answer `boolean`, and `false`
 *   answers `accepted`.
 * - `marketing_email_consent`, `marketing_sms_consent`: the two unticked
 *   consent boxes, true or false (AC-FR-IAM-013-1).
 */
export const SIGN_UP_MEMBERS = [
  'email',
  'password',
  'full_name',
  'phone',
  'age_confirmed',
  'marketing_email_consent',
  'marketing_sms_consent',
] as const

export const signUpValidator = vine.create({
  email: accountEmail(),
  password: vine
    .string()
    .minLength(ACCOUNT_LIMITS.password.min)
    .maxLength(ACCOUNT_LIMITS.password.max),
  full_name: nfcText(ACCOUNT_LIMITS.fullName),
  phone: nepalMobile().nullable().optional(),
  age_confirmed: vine.boolean({ strict: true }).use(ticked()),
  marketing_email_consent: vine.boolean({ strict: true }),
  marketing_sms_consent: vine.boolean({ strict: true }),
})

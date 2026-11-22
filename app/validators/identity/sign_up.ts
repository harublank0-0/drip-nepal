import vine from '@vinejs/vine'
import { accountEmail } from '#validators/support/account_email'
import { nepalMobile } from '#validators/support/nepal_mobile'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'

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
 * - `full_name`: 1 to 100 characters after trimming, in NFC (docs/04 §2.8,
 *   `users_full_name_check`).
 * - `phone`: optional; a Nepali mobile number, handed on in E.164.
 * - `age_confirmed`: the unticked 18+ confirmation, which must be ticked
 *   (A-26; OD-24, decided 2026-11-22 for the build).
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
  full_name: vine
    .string()
    .trim()
    .minLength(ACCOUNT_LIMITS.fullName.min)
    .maxLength(ACCOUNT_LIMITS.fullName.max)
    .transform((value) => value.normalize('NFC')),
  phone: nepalMobile().nullable().optional(),
  age_confirmed: vine.accepted(),
  marketing_email_consent: vine.boolean({ strict: true }),
  marketing_sms_consent: vine.boolean({ strict: true }),
})

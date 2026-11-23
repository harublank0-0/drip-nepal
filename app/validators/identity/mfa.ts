import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'
import { TOTP_CODE_PATTERN } from '#shared/constants/auth'

/*
 * The MFA operations (docs/06 §13.3; docs/07 §3.9). The members are each
 * operation's whole input (`assertKnownMembers`, RF-36).
 *
 * - `token`: the raw `mfa_enrollment` token of the emailed `/mfa?token=…`
 *   link (32 random bytes, base64url, 07 §3.8). Only its type and length
 *   are checked here, as for `resetPassword`; the action answers
 *   `token_invalid` for one that is not this account's live token.
 * - `password`: the current password, up to 128 characters, never trimmed,
 *   no minimum (07 §3.7); checked by the action behind the `reauth`
 *   limiter.
 * - `code`: six digits after trimming (RFC 6238, 07 §3.9). Anything else
 *   answers 422 here, before any limiter is charged: its shape says
 *   nothing about the secret. The page strips spaces a paste carries.
 * - `return_to`: optional; checked by the controller with the helper of
 *   docs/07 TM-14, which turns a rejected value into `/`.
 */
const token = () => vine.string().trim().minLength(1).maxLength(256)
const code = () => vine.string().trim().regex(TOTP_CODE_PATTERN)

export const START_TOTP_ENROLLMENT_MEMBERS = ['token', 'password'] as const

export const startTotpEnrollmentValidator = vine.create({
  token: token(),
  password: vine.string().maxLength(ACCOUNT_LIMITS.password.max),
})

export const CONFIRM_TOTP_ENROLLMENT_MEMBERS = ['code', 'token'] as const

export const confirmTotpEnrollmentValidator = vine.create({
  code: code(),
  token: token(),
})

export const VERIFY_MFA_CHALLENGE_MEMBERS = ['code', 'return_to'] as const

export const verifyMfaChallengeValidator = vine.create({
  code: code(),
  return_to: vine.string().nullable().optional(),
})

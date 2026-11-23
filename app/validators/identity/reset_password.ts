import vine from '@vinejs/vine'
import { newPassword } from '#validators/support/new_password'

/*
 * `resetPassword` (docs/06 §13.3; 01 AC-FR-IAM-004-4). The members are the
 * whole input (`assertKnownMembers`, RF-36).
 *
 * - `token`: the raw token of the emailed link (32 random bytes, base64url,
 *   docs/07 §3.8). Only its type and length are checked here, as for
 *   `confirmEmail`: a missing or empty token, one that is not a string, or
 *   one longer than 256 characters answers 422 with Vine's `required`,
 *   `string` or `max_length`; any other string reaches the action, which
 *   answers `token_invalid` for an unknown, used, replaced or expired one.
 * - `password`: the new password, 10 to 128 characters (`newPassword`).
 */
export const RESET_PASSWORD_MEMBERS = ['token', 'password'] as const

export const resetPasswordValidator = vine.create({
  token: vine.string().trim().minLength(1).maxLength(256),
  password: newPassword(),
})

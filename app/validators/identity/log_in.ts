import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'

/*
 * `logIn` (docs/06 §13.3; 01 FR-IAM-003). The members are the whole input:
 * anything else is refused with `unknown_field` before this runs
 * (`assertKnownMembers`, RF-36).
 *
 * - `email`: trimmed and lower-cased (RF-22), at most 254 characters and
 *   shaped like an address. Not the sign-up rule: an address in `.invalid`
 *   is not refused here, so a development demo account under
 *   `dev.dripnepal.invalid` (docs/09 §8.8) can sign in, and an anonymised
 *   placeholder gets the generic 401 (docs/07 §3.6). A malformed address
 *   can match no account, so its 422 reveals nothing.
 * - `password`: up to 128 characters, never trimmed; no minimum at login
 *   (docs/07 §3.7 [Assumption A-22]), so an older, shorter password still
 *   reaches the check.
 * - `return_to`: optional; any string, checked by the action's caller with
 *   the helper of docs/07 TM-14, which turns a rejected value into `/`.
 */
export const LOG_IN_MEMBERS = ['email', 'password', 'return_to'] as const

export const logInValidator = vine.create({
  email: vine.string().trim().toLowerCase().maxLength(ACCOUNT_LIMITS.email.max).email(),
  password: vine.string().maxLength(ACCOUNT_LIMITS.password.max),
  return_to: vine.string().nullable().optional(),
})

import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'

/*
 * `requestPasswordReset` (docs/06 §13.3; 01 FR-IAM-004). The members are
 * the whole input: anything else is refused with `unknown_field` before
 * this runs (`assertKnownMembers`, RF-36).
 *
 * - `email`: trimmed and lower-cased (RF-22), at most 254 characters and
 *   shaped like an address, as at sign-in. Not the sign-up rule: an address
 *   in `.invalid` is not refused, so a development demo account under
 *   `dev.dripnepal.invalid` (docs/09 §8.8) can try the flow in Mailpit,
 *   and an anonymised placeholder gets the same 202 as any address. A
 *   malformed address can match no account, so its 422 reveals nothing.
 */
export const REQUEST_PASSWORD_RESET_MEMBERS = ['email'] as const

export const requestPasswordResetValidator = vine.create({
  email: vine.string().trim().toLowerCase().maxLength(ACCOUNT_LIMITS.email.max).email(),
})

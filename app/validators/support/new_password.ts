import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'

/*
 * The one rule of a password a user chooses (docs/07 §3.7 [Assumption
 * A-22]; docs/09 §3.6): 10 to 128 characters, no composition rule, never
 * trimmed, so spaces count and a password manager's value is kept as it is.
 * `signUp`, `resetPassword` and `changePassword` use it; sign-in does not,
 * because it has no minimum.
 */
export const newPassword = () =>
  vine.string().minLength(ACCOUNT_LIMITS.password.min).maxLength(ACCOUNT_LIMITS.password.max)

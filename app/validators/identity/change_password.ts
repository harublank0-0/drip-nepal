import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'
import { newPassword } from '#validators/support/new_password'

/*
 * `changePassword` (docs/06 §13.3; 01 FR-IAM-005). The members are the
 * whole input (`assertKnownMembers`, RF-36).
 *
 * - `current_password`: up to 128 characters, never trimmed, no minimum, so
 *   an older, shorter password still reaches the check (docs/07 §3.7); the
 *   check is the action's, behind the `reauth` limiter.
 * - `new_password`: 10 to 128 characters (`newPassword`). Checked here,
 *   before the action, so a new password out of range answers 422 without
 *   charging the limiter or spending a hash.
 */
export const CHANGE_PASSWORD_MEMBERS = ['current_password', 'new_password'] as const

export const changePasswordValidator = vine.create({
  current_password: vine.string().maxLength(ACCOUNT_LIMITS.password.max),
  new_password: newPassword(),
})

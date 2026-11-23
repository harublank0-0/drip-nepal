import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'

/*
 * `requestAccountDeletion` (docs/06 §13.3; 01 FR-IAM-009). The one member
 * is the whole input (`assertKnownMembers`, RF-36): no free text is taken,
 * because the request's only record is an insert-only audit row that
 * outlives anonymisation (docs/04 §19.2), and 01 and 02 ask for no reason.
 *
 * - `password`: the current password, up to 128 characters, never trimmed,
 *   no minimum (docs/07 §3.7); checked by the action behind the `reauth`
 *   limiter.
 */
export const REQUEST_ACCOUNT_DELETION_MEMBERS = ['password'] as const

export const requestAccountDeletionValidator = vine.create({
  password: vine.string().maxLength(ACCOUNT_LIMITS.password.max),
})

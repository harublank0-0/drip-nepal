import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'
import { nfcText } from '#validators/support/nfc_text'

/*
 * `requestAccountDeletion` (docs/06 §13.3; 01 FR-IAM-009). The members are
 * the whole input (`assertKnownMembers`, RF-36).
 *
 * - `password`: the current password, up to 128 characters, never trimmed,
 *   no minimum (docs/07 §3.7); checked by the action behind the `reauth`
 *   limiter.
 * - `reason`: optional free text, trimmed and normalised to NFC, at most
 *   500 code points (proposed, `ACCOUNT_LIMITS.deletionReason`); null or
 *   empty means none. It is kept in the audit row's `reason`, within
 *   `audit_logs_reason_check` (docs/04a §15.3), where the writer masks
 *   email addresses and mobile numbers.
 */
export const REQUEST_ACCOUNT_DELETION_MEMBERS = ['password', 'reason'] as const

export const requestAccountDeletionValidator = vine.create({
  password: vine.string().maxLength(ACCOUNT_LIMITS.password.max),
  reason: nfcText({ min: 0, max: ACCOUNT_LIMITS.deletionReason.max }).nullable().optional(),
})

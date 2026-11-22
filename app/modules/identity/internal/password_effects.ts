import { randomUUID } from 'node:crypto'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { InvariantViolation } from '#exceptions/programming_errors'
import { sendJob, type SendJobOptions } from '#modules/platform/jobs'

/*
 * What a new password does besides the hash and the stamp, shared by
 * `resetPassword` and `changePassword` (docs/07 §3.3, §3.8; docs/03 §9),
 * inside the caller's transaction, after it has locked or compare-and-set
 * the user's row (docs/04a §5.2: `users`, then `user_tokens`).
 */

/*
 * The live tokens a password change invalidates (07 §3.8): every
 * `password_reset` token, and an `mfa_enrollment` token only once the
 * account has TOTP enrolled. While `mfa_enabled_at` is null, an enrolment
 * window opened by a staff grant, `platform:create-admin` or an MFA reset
 * stays open, so the invitation's reset does not close it (OD-60, decided
 * 2026-11-22). Returns how many it consumed.
 */
export async function consumeTokensOnPasswordChange(
  trx: TransactionClientContract,
  userId: string,
  mfaEnabled: boolean
): Promise<number> {
  const purposes = mfaEnabled ? ['password_reset', 'mfa_enrollment'] : ['password_reset']
  const consumed: { id: string }[] = await trx
    .from('user_tokens')
    .where('user_id', userId)
    .whereIn('purpose', purposes)
    .whereNull('consumed_at')
    .update({ consumed_at: trx.knexRawQuery('now()') }, ['id'])
  return consumed.length
}

/*
 * `identity.revoke_sessions` for the user, carrying the user ID only (07
 * §3.3). `changePassword` and `revokeAllSessions` send it with `startAfter`
 * 10 s [Assumption], so the acting session has committed its new stamp
 * before the job reads it; `resetPassword` keeps no session, so it sends it
 * at once.
 */
export const ACTING_SESSION_GRACE_SECONDS = 10

export async function sendRevokeSessions(
  trx: TransactionClientContract,
  userId: string,
  requestId: string | null,
  options: Pick<SendJobOptions, 'startAfter'> = {}
) {
  const jobId = await sendJob(
    trx,
    'identity.revoke_sessions',
    { user_id: userId, request_id: requestId, causation_id: null },
    options
  )
  // A standard queue never refuses a send; a null id would leave the old sessions alive.
  if (!jobId) throw new InvariantViolation('identity.revoke_sessions refused the job')
}

/*
 * The "your password was changed" email (AC-J18-06, AC-FR-IAM-004-4,
 * AC-FR-IAM-005-4, FR-NOT-001): the event `user.password_changed`, which
 * has no row of its own, so it gets a random `event_id` that the delivery
 * row's `dedupe_key` names, as `user.signup_attempted` does.
 */
export async function sendPasswordChangedEmail(
  trx: TransactionClientContract,
  userId: string,
  requestId: string | null
) {
  const jobId = await sendJob(trx, 'notifications.dispatch', {
    event: 'user.password_changed',
    event_id: randomUUID(),
    user_id: userId,
    request_id: requestId,
    causation_id: null,
  })
  if (!jobId) throw new InvariantViolation('notifications.dispatch refused the password email job')
}

/*
 * The "sessions revoked" email (01 AC-FR-NOT-001-1): the event
 * `user.sessions_revoked`, sent by `revokeAllSessions` and by the `reauth`
 * lockout, which signs every device out. The holder learns of it even when
 * a stolen session did it. A random `event_id`, as for the other notices.
 */
export async function sendSessionsRevokedEmail(
  trx: TransactionClientContract,
  userId: string,
  requestId: string | null
) {
  const jobId = await sendJob(trx, 'notifications.dispatch', {
    event: 'user.sessions_revoked',
    event_id: randomUUID(),
    user_id: userId,
    request_id: requestId,
    causation_id: null,
  })
  if (!jobId) throw new InvariantViolation('notifications.dispatch refused the sessions email job')
}

import { DomainError } from '#exceptions/domain_error'
import { ACCOUNT_SUSPENDED_DETAIL } from '#shared/constants/auth'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { SIGNED_IN_STATUSES, maySignIn } from '#modules/identity/domain/user_status'
import {
  ACTING_SESSION_GRACE_SECONDS,
  sendRevokeSessions,
  sendSessionsRevokedEmail,
} from '#modules/identity/internal/password_effects'
import { selfActor } from '#modules/identity/internal/self_actor'
import { rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'

/*
 * `revokeAllSessions` (docs/06 §13.3; 01 AC-FR-IAM-005-3; 02 J-18 step 5,
 * "Sign out of all devices"), the identity entry action for the signed-in
 * user. It never touches the session: the controller puts the new stamp it
 * returns into the acting session, which keeps its ID and tag (docs/07
 * §3.3), so it survives the job.
 *
 * First the `revoke_all` limiter (5 per hour per user, proposed, docs/06
 * §9.1) takes a point on every call: each call queues an email to the
 * account's address, which may be unverified, and the session survives to
 * call again, so without it one session could send an email per request
 * (07 TM-09). Past it, 429 `RATE_LIMITED` and nothing is written.
 *
 * Then, in one transaction: a compare-and-set gives the account a new
 * `security_stamp` only while it may sign in and still holds the stamp of
 * the acting session, so a session that a password change or reset made
 * stale meanwhile cannot take the new stamp and outlive the change (its
 * next request is refused instead: 403 `ACCOUNT_SUSPENDED` if the status
 * changed, else 401 `UNAUTHENTICATED`). Then `identity.revoke_sessions` is
 * sent with `startAfter` 10 s, which deletes every other session of the
 * user once this one has committed the new stamp; the "sessions revoked"
 * email is queued (01 AC-FR-NOT-001-1), so the holder learns of it even
 * when a stolen session did it; and one `auth.sessions_revoke` audit row is
 * written.
 */

export type RevokeAllSessionsContext = { requestId: string | null; ipHash: Buffer | null }
export type RevokeAllSessionsResult = { securityStamp: string }

export async function revokeAllSessions(
  userId: string,
  // The `security_stamp` the acting session holds, which the account check has just compared.
  sessionStamp: string,
  context: RevokeAllSessionsContext
): Promise<RevokeAllSessionsResult> {
  await rateLimiter('revoke_all').consume(rateLimitKey('revoke_all', userId))
  return withTx(async (trx) => {
    const rows: { security_stamp: string }[] = await trx
      .from('users')
      .where('id', userId)
      .whereIn('status', [...SIGNED_IN_STATUSES])
      .where('security_stamp', sessionStamp)
      .update({ security_stamp: trx.knexRawQuery('gen_random_uuid()') }, ['security_stamp'])
    const row = rows[0]
    if (!row) {
      const current = await trx.from('users').where('id', userId).select('status').first()
      if (current && !maySignIn(current.status)) {
        throw new DomainError('ACCOUNT_SUSPENDED', { detail: ACCOUNT_SUSPENDED_DETAIL })
      }
      throw new DomainError('UNAUTHENTICATED', { detail: 'Please log in to continue.' })
    }

    await sendRevokeSessions(trx, userId, context.requestId, {
      startAfter: ACTING_SESSION_GRACE_SECONDS,
    })
    await sendSessionsRevokedEmail(trx, userId, context.requestId)
    const actor = await selfActor(trx, userId)
    await recordAudit(trx, {
      ...actor,
      actorUserId: userId,
      action: 'auth.sessions_revoke',
      subjectType: 'user',
      subjectId: userId,
      requestId: context.requestId,
      ipHash: context.ipHash,
      changes: { changed: ['security_stamp'] },
    })
    return { securityStamp: String(row.security_stamp) }
  })
}

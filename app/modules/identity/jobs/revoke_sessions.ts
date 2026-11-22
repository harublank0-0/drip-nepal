import logger from '@adonisjs/core/services/logger'
import type { JobEnvelope } from '#modules/platform/jobs'
import { taggedSessions } from '#modules/platform/session_store'
import { jobTx } from '#modules/platform/tx'
import type { RevokeSessions } from '#modules/identity/events'

/*
 * `identity.revoke_sessions` (docs/03 §9, docs/07 §3.3; M1 part 4): ends
 * every session of the user that no longer holds the user's current
 * `security_stamp`. Sent by `resetPassword`, `changePassword`,
 * `revokeAllSessions` and the `reauth` lockout (the 10th wrong password
 * re-entry in 24 h); `user.suspended` and `requestAccountDeletion` join
 * with their operations.
 *
 * In one `jobTx`:
 * 1. The user's row is read `FOR SHARE`, so an action that rotates the
 *    stamp meanwhile waits until this job commits; the stamp the job
 *    compares stays the current one while it deletes.
 * 2. The live session rows tagged with the user are read
 *    (`taggedSessions`), and each whose `security_stamp` differs, or whose
 *    data does not verify, is deleted, but only while its stored data is
 *    still what the job read: a session that a request has written since
 *    (the acting session committing the new stamp after the job read it)
 *    survives.
 *
 * The acting session of a password change or "sign out everywhere" holds
 * the new stamp once its request has committed it, so it survives, and so
 * does any session signed in after the change; after a reset or a lockout
 * no session holds it, so all go. A session that is already gone is not
 * found: running the job again, or after a later rotation, deletes only
 * what is stale then (idempotent, docs/03 §10.3). The next request of a
 * deleted session is a guest's: 401 on a protected route (07 §3.3 row 2).
 * Log lines carry IDs and counts only.
 */

export type RevokeOutcome = { destroyed: number; kept: number }

export async function revokeSessions(
  payload: RevokeSessions & JobEnvelope
): Promise<RevokeOutcome> {
  const outcome = await jobTx(async (trx) => {
    const locked = await trx.rawQuery('SELECT security_stamp FROM users WHERE id = ? FOR SHARE', [
      payload.user_id,
    ])
    const user: { security_stamp: string } | undefined = locked.rows[0]
    const sessions = await taggedSessions(trx, payload.user_id)
    let destroyed = 0
    for (const session of sessions) {
      // A user row that no longer exists keeps no session (users are never deleted, 04a §5.1).
      const current =
        user !== undefined &&
        session.data !== null &&
        session.data.security_stamp === String(user.security_stamp)
      if (current) continue
      const deleted = await trx
        .from('sessions')
        .where('id', session.id)
        .where('data', session.raw)
        .delete()
      destroyed += Number(deleted)
    }
    return { destroyed, kept: sessions.length - destroyed }
  })
  logger.info(
    {
      event: 'identity.sessions_revoked',
      user_id: payload.user_id,
      destroyed: outcome.destroyed,
      kept: outcome.kept,
      request_id: payload.request_id,
    },
    'sessions revoked'
  )
  return outcome
}

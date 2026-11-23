import { randomUUID } from 'node:crypto'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError } from '#exceptions/domain_error'
import { ACCOUNT_SUSPENDED_DETAIL } from '#shared/constants/auth'
import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { maySignIn } from '#modules/identity/domain/user_status'
import { sendRevokeSessions } from '#modules/identity/internal/password_effects'
import { reauthenticate } from '#modules/identity/internal/reauth'
import { selfActor } from '#modules/identity/internal/self_actor'
import { sendJob } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'

/*
 * `requestAccountDeletion` (docs/06 §13.3; 01 FR-IAM-009, AC-FR-IAM-009-1;
 * docs/04 §19.2 step 1; docs/07 §3.12), the identity entry action for the
 * signed-in user, `pending_verification` included. It closes the account at
 * once; staff anonymise it later (`anonymizeUser`, M7). It never touches
 * the session: the controller ends this one, and the job ends the others.
 *
 * 1. The password goes through the `reauth` limiter (`reauthenticate`,
 *    docs/07 §3.6), as `changePassword`'s current password does: both keys
 *    charged before the hash, 429 without hashing past 5 wrong passwords in
 *    15 minutes, the 10th in 24 h ends every session. A wrong password
 *    writes `auth.reauth_failed` and answers 422 on `password`
 *    (`password_incorrect`); nothing else is written.
 * 2. In one transaction, in the lock order of docs/04a §5.4 (the admin
 *    `platform_staff` rows, then `users`): for a requester who holds an
 *    unrevoked `platform_admin` row, every unrevoked `platform_admin` row is
 *    locked `FOR UPDATE`, and a second statement, whose snapshot sees what
 *    the lock waited for, counts the other admins whose account is
 *    `active`. The last active admin gets 409 `CONFLICT` and nothing
 *    changes, because a deactivated admin cannot sign in (07 §3.12); two
 *    admins asking at once cannot both pass (T-IAM-110).
 * 3. The user's row is locked `FOR NO KEY UPDATE` and read, then a
 *    compare-and-set on what the read saw, a signed-in status (the `from`),
 *    the acting session's stamp and the hash the check verified, sets
 *    `status = deactivated`, `deletion_requested_at` and a new
 *    `security_stamp`. A suspension, password change, reset or "sign out
 *    everywhere" that committed in between wins: 403 `ACCOUNT_SUSPENDED` if
 *    the status changed, else 401 `UNAUTHENTICATED`, and nothing changes.
 *    So of two requests at once, one closes the account and sends the email.
 * 4. `identity.revoke_sessions` is sent at once: no session keeps the new
 *    stamp, so every session of the user ends (07 §3.3). The "deletion
 *    request received" email (01 AC-FR-NOT-001-1, the event
 *    `user.deletion_requested`) is queued; it needs no limiter of its own,
 *    because the request succeeds once per deactivation and the session it
 *    came from ends with it. One `user.deletion_request` audit row
 *    (proposed, docs/04a §15.3) records the transition. No free text is
 *    taken or kept: an audit row is insert-only and outlives anonymisation,
 *    so a reason typed by the requester could never be removed (04 §19.2).
 *    The live tokens stay: no operation redeems one for an account that may
 *    not sign in (07 §3.8).
 *
 * The request appears in the admin deletion queue by its status and
 * `deletion_requested_at` (`users_deletion_queue_idx`; the admin pages,
 * M1 part 7).
 */

export type RequestAccountDeletionCommand = {
  password: string
  // The `security_stamp` the acting session holds, which the account check has just compared.
  sessionStamp: string
}

export type RequestAccountDeletionContext = { requestId: string | null; ipHash: Buffer | null }

export type RequestAccountDeletionResult = { status: 'deletion_requested' }

type LockedUser = { status: string; security_stamp: string; password_hash: string | null }

function wrongPassword() {
  return new DomainError('VALIDATION_FAILED', {
    detail: 'Some fields need attention.',
    errors: [
      { field: 'password', code: 'password_incorrect', message: 'Your password is not correct.' },
    ],
  })
}

function staleSession(status: string | undefined) {
  if (status !== undefined && !maySignIn(status)) {
    return new DomainError('ACCOUNT_SUSPENDED', { detail: ACCOUNT_SUSPENDED_DETAIL })
  }
  return new DomainError('UNAUTHENTICATED', { detail: 'Please log in to continue.' })
}

/*
 * The last-admin rule of docs/07 §3.12 and docs/04a §5.4, under the lock on
 * every unrevoked `platform_admin` row, taken first and in one order, so two
 * requests never lock the rows crosswise. Only a requester who holds such a
 * row takes it; a requester whose row was revoked while it waited is no
 * longer an admin, and passes.
 */
async function assertNotLastActiveAdmin(trx: TransactionClientContract, userId: string) {
  const own = await trx
    .from('platform_staff')
    .where('user_id', userId)
    .whereNull('revoked_at')
    .select('role')
    .first()
  if (own?.role !== 'platform_admin') return

  await trx.rawQuery(
    `SELECT user_id FROM platform_staff
      WHERE role = 'platform_admin' AND revoked_at IS NULL
      ORDER BY user_id
      FOR UPDATE`
  )
  const counted = await trx.rawQuery(
    `SELECT (count(*) FILTER (WHERE s.user_id <> ?))::int AS others,
            coalesce(bool_or(s.user_id = ?), false) AS self
       FROM platform_staff s
       JOIN users u ON u.id = s.user_id
      WHERE s.role = 'platform_admin' AND s.revoked_at IS NULL AND u.status = 'active'`,
    [userId, userId]
  )
  const row: { others: number; self: boolean } = counted.rows[0]
  if (row.self && row.others === 0) {
    throw new DomainError('CONFLICT', {
      detail:
        'You are the only active platform admin. Give the role to another account before you delete this one.',
    })
  }
}

// The "deletion request received" email: the event has no row of its own, so a random `event_id`.
async function sendDeletionRequestedEmail(
  trx: TransactionClientContract,
  userId: string,
  requestId: string | null
) {
  const jobId = await sendJob(trx, 'notifications.dispatch', {
    event: 'user.deletion_requested',
    event_id: randomUUID(),
    user_id: userId,
    request_id: requestId,
    causation_id: null,
  })
  if (!jobId) throw new InvariantViolation('notifications.dispatch refused the deletion email job')
}

export async function requestAccountDeletion(
  userId: string,
  command: RequestAccountDeletionCommand,
  context: RequestAccountDeletionContext
): Promise<RequestAccountDeletionResult> {
  const checked = await reauthenticate(userId, command.password, {
    actor: 'self',
    requestId: context.requestId,
    ipHash: context.ipHash,
  })
  if (!checked.ok) throw wrongPassword()
  const verifiedHash = checked.passwordHash

  await withTx(async (trx) => {
    await assertNotLastActiveAdmin(trx, userId)

    const locked = await trx.rawQuery(
      'SELECT status, security_stamp, password_hash FROM users WHERE id = ? FOR NO KEY UPDATE',
      [userId]
    )
    const user: LockedUser | undefined = locked.rows[0]
    if (
      !user ||
      !maySignIn(user.status) ||
      String(user.security_stamp) !== command.sessionStamp ||
      user.password_hash !== verifiedHash
    ) {
      throw staleSession(user?.status)
    }

    const from = user.status
    const updated: { id: string }[] = await trx
      .from('users')
      .where('id', userId)
      .where('status', from)
      .where('security_stamp', command.sessionStamp)
      .where('password_hash', verifiedHash)
      .update(
        {
          status: 'deactivated',
          deletion_requested_at: trx.knexRawQuery('now()'),
          security_stamp: trx.knexRawQuery('gen_random_uuid()'),
        },
        ['id']
      )
    // The row is locked and was read with these values, so the update cannot miss.
    if (updated.length === 0) throw staleSession(undefined)

    await sendRevokeSessions(trx, userId, context.requestId)
    await sendDeletionRequestedEmail(trx, userId, context.requestId)
    const actor = await selfActor(trx, userId)
    await recordAudit(trx, {
      ...actor,
      actorUserId: userId,
      action: 'user.deletion_request',
      subjectType: 'user',
      subjectId: userId,
      requestId: context.requestId,
      ipHash: context.ipHash,
      changes: {
        status: { from, to: 'deactivated' },
        changed: ['deletion_requested_at', 'security_stamp'],
      },
    })
  })

  return { status: 'deletion_requested' }
}

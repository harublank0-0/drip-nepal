import hash from '@adonisjs/core/services/hash'
import { DomainError } from '#exceptions/domain_error'
import { ACCOUNT_SUSPENDED_DETAIL } from '#shared/constants/auth'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { SIGNED_IN_STATUSES, maySignIn } from '#modules/identity/domain/user_status'
import {
  ACTING_SESSION_GRACE_SECONDS,
  consumeTokensOnPasswordChange,
  sendPasswordChangedEmail,
  sendRevokeSessions,
} from '#modules/identity/internal/password_effects'
import { reauthenticate } from '#modules/identity/internal/reauth'
import { selfActor } from '#modules/identity/internal/self_actor'
import { clientNetwork, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'

/*
 * `changePassword` (docs/06 §13.3; 01 FR-IAM-005; 02 J-18 step 5), the
 * identity entry action for the signed-in user. It never touches the
 * session: the controller puts the new stamp it returns into the acting
 * session and rotates its ID (`rotateSessionId`, docs/07 §3.1).
 *
 * 1. The current password goes through the `reauth` limiter
 *    (`reauthenticate`, docs/07 §3.6): both keys are charged before the
 *    hash, past 5 wrong passwords in 15 minutes the answer is 429 without
 *    hashing, and the 10th in 24 h ends every session. A wrong password
 *    writes `auth.reauth_failed`, adds a point to the caller's
 *    `login_acct_ip` key (the account's email and the client network) so
 *    it counts toward the login limit too (AC-FR-IAM-005-1), and answers
 *    422 on `current_password`. That point is added after the check, with
 *    `increment()`, which never refuses: `reauth` is what gates this
 *    operation, so a sign-in burst from the same network does not block
 *    a password change, and a password change does not delete the key a
 *    sign-in would.
 * 2. A right password takes a point of the `password_change` limiter (5
 *    per hour per user, proposed, docs/06 §9.1) before anything is written:
 *    `reauth` gives a right password's points back, and each change queues
 *    an email to the account's address, which may be unverified, so this
 *    bounds them (07 TM-09). Then the new password is hashed, before the
 *    transaction.
 * 3. In one transaction: a compare-and-set writes the new hash and a new
 *    `security_stamp` only while the account may sign in and still holds
 *    the stamp of the acting session and the hash the check verified, so a
 *    reset, another change or "sign out everywhere" that committed in
 *    between is never overwritten, nor handed to this session (the job
 *    spares whoever holds the new stamp). A miss answers 403
 *    `ACCOUNT_SUSPENDED` if the status changed, else 401 `UNAUTHENTICATED`:
 *    this session is stale, and its next request ends it (07 §3.3 row 3).
 * 4. The live `password_reset` tokens are consumed (07 §3.8), and a live
 *    `mfa_enrollment` token is kept while TOTP is not enrolled (OD-60);
 *    `identity.revoke_sessions` is sent with `startAfter` 10 s, so the
 *    acting session has committed the new stamp before the job reads it,
 *    and the "password changed" email is queued (AC-FR-IAM-005-4); one
 *    `auth.password_change` audit row is written.
 */

export type ChangePasswordCommand = {
  currentPassword: string
  newPassword: string
  // The `security_stamp` the acting session holds, which the account check has just compared.
  sessionStamp: string
}

export type ChangePasswordContext = {
  // `request.ip()`, which honours trusted proxies only.
  ip: string
  requestId: string | null
  ipHash: Buffer | null
}

export type ChangePasswordResult = { securityStamp: string }

function wrongCurrentPassword() {
  return new DomainError('VALIDATION_FAILED', {
    detail: 'Some fields need attention.',
    errors: [
      {
        field: 'current_password',
        code: 'password_incorrect',
        message: 'Your current password is not correct.',
      },
    ],
  })
}

export async function changePassword(
  userId: string,
  command: ChangePasswordCommand,
  context: ChangePasswordContext
): Promise<ChangePasswordResult> {
  // The actor of the audit rows is read only when one is written (07 §3.6: limiters first).
  const checked = await reauthenticate(userId, command.currentPassword, {
    actor: 'self',
    requestId: context.requestId,
    ipHash: context.ipHash,
  })
  if (!checked.ok) {
    if (checked.email) {
      await rateLimiter('login_acct_ip').increment(
        rateLimitKey('login_acct_ip', checked.email, clientNetwork(context.ip))
      )
    }
    throw wrongCurrentPassword()
  }
  const verifiedHash = checked.passwordHash

  // Each change queues an email; a right password gives its `reauth` points back, so this bounds them.
  await rateLimiter('password_change').consume(rateLimitKey('password_change', userId))
  const passwordHash = await hash.use('scrypt').make(command.newPassword)

  return withTx(async (trx) => {
    const rows: { security_stamp: string; mfa_enabled_at: Date | null }[] = await trx
      .from('users')
      .where('id', userId)
      .whereIn('status', [...SIGNED_IN_STATUSES])
      .where('security_stamp', command.sessionStamp)
      .where('password_hash', verifiedHash)
      .update(
        { password_hash: passwordHash, security_stamp: trx.knexRawQuery('gen_random_uuid()') },
        ['security_stamp', 'mfa_enabled_at']
      )
    const row = rows[0]
    if (!row) {
      const current = await trx.from('users').where('id', userId).select('status').first()
      if (current && !maySignIn(current.status)) {
        throw new DomainError('ACCOUNT_SUSPENDED', { detail: ACCOUNT_SUSPENDED_DETAIL })
      }
      throw new DomainError('UNAUTHENTICATED', { detail: 'Please log in to continue.' })
    }

    await consumeTokensOnPasswordChange(trx, userId, row.mfa_enabled_at !== null)
    await sendRevokeSessions(trx, userId, context.requestId, {
      startAfter: ACTING_SESSION_GRACE_SECONDS,
    })
    await sendPasswordChangedEmail(trx, userId, context.requestId)
    const actor = await selfActor(trx, userId)
    await recordAudit(trx, {
      ...actor,
      actorUserId: userId,
      action: 'auth.password_change',
      subjectType: 'user',
      subjectId: userId,
      requestId: context.requestId,
      ipHash: context.ipHash,
      changes: { changed: ['password_hash', 'security_stamp'] },
    })
    return { securityStamp: String(row.security_stamp) }
  })
}

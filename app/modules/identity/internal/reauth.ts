import hash from '@adonisjs/core/services/hash'
import { recordAudit, type AuditEntry } from '#modules/audit/actions/record_audit'
import { sendRevokeSessions } from '#modules/identity/internal/password_effects'
import { rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'

/*
 * Password re-entry inside a session (docs/07 §3.6, docs/06 §9.1 `reauth`),
 * for `changePassword` and the shop courier-account operations
 * (`confirmPassword`):
 *
 * 1. Both `reauth` keys, `reauth:user` (5 per 15 minutes) and
 *    `reauth:user_day` (10 per 24 h), take their point with `consume()`
 *    before the password is hashed, so a burst is refused with 429 without
 *    hashing, however many attempts arrive at once.
 * 2. The password is verified against the stored hash with the `scrypt`
 *    hasher. A right password gives this attempt's points back, so only
 *    wrong ones count, and returns what the check read: the hash and the
 *    stamp a caller's compare-and-set guards, and the address (which a
 *    wrong password returns too, for `changePassword`'s login point).
 * 3. A wrong password keeps both points and writes one `auth.reauth_failed`
 *    row by the caller's actor (docs/04a §15.3). The one that uses up the
 *    day key, the 10th in 24 h, also rotates `security_stamp` and sends
 *    `identity.revoke_sessions` in the same transaction, which ends every
 *    session of the user, the possibly stolen one included (07 §3.3).
 *
 * The email to the account holder after the fifth wrong password in 15
 * minutes (07 §3.6) is not sent yet (docs/12 §5.1).
 */

export type ReauthContext = {
  actor: { actorType: AuditEntry['actorType']; actorRole: string | null }
  requestId: string | null
  ipHash?: Buffer | null
}

// What the check read: on a right password, the hash and stamp a caller's compare-and-set guards.
export type ReauthOutcome =
  | { ok: true; passwordHash: string; securityStamp: string; email: string }
  | { ok: false; email: string | null }

export async function reauthenticate(
  userId: string,
  password: string,
  context: ReauthContext
): Promise<ReauthOutcome> {
  const perWindow = rateLimiter('reauth_user')
  const perDay = rateLimiter('reauth_user_day')
  const windowKey = rateLimitKey('reauth_user', userId)
  const dayKey = rateLimitKey('reauth_user_day', userId)
  await perWindow.consume(windowKey)
  await perDay.consume(dayKey)

  const user: { password_hash: string | null; security_stamp: string; email: string } | null =
    await withTx((trx) =>
      trx
        .from('users')
        .where('id', userId)
        .select('password_hash', 'security_stamp', 'email')
        .first()
    )
  const stored = user?.password_hash ?? null
  if (user && stored && (await hash.use('scrypt').verify(stored, password))) {
    await perWindow.decrement(windowKey)
    await perDay.decrement(dayKey)
    return {
      ok: true,
      passwordHash: stored,
      securityStamp: String(user.security_stamp),
      email: user.email,
    }
  }

  const remainingToday = await perDay.remaining(dayKey)
  await withTx(async (trx) => {
    await recordAudit(trx, {
      actorType: context.actor.actorType,
      actorRole: context.actor.actorRole,
      actorUserId: userId,
      action: 'auth.reauth_failed',
      subjectType: 'user',
      subjectId: userId,
      requestId: context.requestId,
      ipHash: context.ipHash ?? null,
      changes: remainingToday <= 0 ? { changed: ['security_stamp'] } : {},
    })
    if (remainingToday > 0) return
    const rotated: { id: string }[] = await trx
      .from('users')
      .where('id', userId)
      .update({ security_stamp: trx.knexRawQuery('gen_random_uuid()') }, ['id'])
    if (rotated.length === 0) return
    await sendRevokeSessions(trx, userId, context.requestId)
  })
  return { ok: false, email: user?.email ?? null }
}

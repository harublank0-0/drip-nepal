import hash from '@adonisjs/core/services/hash'
import { DomainError } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'

/*
 * Password re-entry (docs/07 §3.6): the shop courier-account operations ask
 * the owner for their current password (07 §3.10, TM-32). Both `reauth` keys
 * are checked before the password is hashed and charged before the check, so
 * a burst is refused without hashing (429). A wrong password answers 422 on
 * `password` and writes an `auth.reauth_failed` audit row; a right one
 * clears neither key, so wrong guesses keep counting. The tenth wrong
 * password in 24 hours rotates `security_stamp`, which ends every session of
 * the account at its next request. The email to the account holder after the
 * fifth comes with the M1 notifications.
 */
export async function confirmPassword(userId: string, password: string, requestId: string | null) {
  const perWindow = rateLimiter('reauth_user')
  const perDay = rateLimiter('reauth_user_day')
  const windowKey = rateLimitKey('reauth_user', userId)
  const dayKey = rateLimitKey('reauth_user_day', userId)
  await perWindow.consume(windowKey)
  await perDay.consume(dayKey)

  const user = await withTx((trx) =>
    trx.from('users').where('id', userId).select('password_hash').first()
  )
  if (user && (await hash.verify(user.password_hash, password))) {
    // A right password gives the points back: only wrong ones count (07 §3.6).
    await perWindow.decrement(windowKey)
    await perDay.decrement(dayKey)
    return
  }
  const remainingToday = await perDay.remaining(dayKey)
  await withTx(async (trx) => {
    await recordAudit(trx, {
      actorType: 'shop_member',
      actorUserId: userId,
      action: 'auth.reauth_failed',
      subjectType: 'user',
      subjectId: userId,
      requestId,
    })
    if (remainingToday <= 0) {
      await trx
        .from('users')
        .where('id', userId)
        .update({
          security_stamp: trx.raw('gen_random_uuid()::text'),
          updated_at: trx.raw('now()'),
        })
    }
  })
  throw new DomainError('VALIDATION_FAILED', {
    errors: [
      { field: 'password', code: 'password_incorrect', message: 'Your password is not correct.' },
    ],
  })
}

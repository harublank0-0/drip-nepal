import { DomainError } from '#exceptions/domain_error'
import { reauthenticate } from '#modules/identity/internal/reauth'

/*
 * Password re-entry (docs/07 §3.6): the shop courier-account operations ask
 * the owner for their current password (07 §3.10, TM-32). The `reauth`
 * limiter, the audit row and the lockout are `reauthenticate`'s
 * (internal/reauth.ts): both keys are checked before the password is hashed
 * and charged before the check, so a burst is refused without hashing (429);
 * a right password gives its points back, so only wrong ones count. A wrong
 * password answers 422 on `password` and writes an `auth.reauth_failed`
 * audit row; the tenth wrong password in 24 hours rotates `security_stamp`
 * and sends `identity.revoke_sessions`, which ends every session of the
 * account.
 */
export async function confirmPassword(userId: string, password: string, requestId: string | null) {
  const checked = await reauthenticate(userId, password, {
    actor: { actorType: 'shop_member', actorRole: null },
    requestId,
  })
  if (checked.ok) return
  throw new DomainError('VALIDATION_FAILED', {
    errors: [
      { field: 'password', code: 'password_incorrect', message: 'Your password is not correct.' },
    ],
  })
}

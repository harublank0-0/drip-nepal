import { runtime } from '#config/runtime'
import { DomainError } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { TOTP, generateTotpSecret, otpauthUri } from '#modules/identity/domain/totp'
import {
  alreadyEnrolled,
  invalidEnrolmentToken,
  liveEnrolmentToken,
  staffMfaAccount,
} from '#modules/identity/internal/mfa_account'
import { reauthenticate } from '#modules/identity/internal/reauth'
import { selfActor } from '#modules/identity/internal/self_actor'
import { sealTotpSecret } from '#modules/identity/internal/totp_secret'
import { withTx } from '#modules/platform/tx'

/*
 * `startTotpEnrollment` (docs/06 §13.3; docs/07 §3.9; 01 FR-IAM-007), the
 * identity entry action for a signed-in staff member without TOTP. The
 * enrolment proves the mailbox as well as the password, so whoever holds a
 * staff password alone cannot bind their own authenticator before the real
 * person enrols (07 §3.9):
 *
 * 1. Checks that cost nothing and charge nothing: a caller who is not
 *    active staff gets 403 (`staffMfaAccount`); an account with TOTP on
 *    gets 409 `CONFLICT`; `token` must be the live `mfa_enrollment` token
 *    issued to this account (07 §3.8: purpose, owner, unconsumed,
 *    unexpired), else 422 on `token`. A token of another purpose or of
 *    another account matches nothing and is left as it is.
 * 2. The current password, through `reauthenticate` (07 §3.6): both
 *    `reauth` keys take their point before the hash, so past 5 wrong
 *    passwords in 15 minutes the answer is 429 without hashing; a wrong
 *    password keeps the points, writes `auth.reauth_failed` and answers
 *    422 on `password`; the 10th in 24 h signs every device out.
 * 3. A new 160-bit secret is sealed (`mfa_totp_secret_enc`, docs/04 §2.9)
 *    and stored by a compare-and-set on what the checks read: still active,
 *    still without TOTP and still the password just verified, so a password
 *    change or a confirmation that committed meanwhile wins. In the same
 *    transaction, after the user's row is locked by that update, the token
 *    must still be live (a confirmation in another tab consumes it). Each
 *    start replaces the pending secret, which is how a lost setup screen is
 *    started again, and writes one `auth.mfa_enrollment_start` audit row
 *    (proposed). `mfa_last_used_step` is cleared with it.
 * 4. The `otpauth://` URI and the secret are returned once (Cache-Control
 *    `no-store` on the response); nothing stores them in plaintext.
 *
 * The token is not consumed here: `confirmTotpEnrollment` consumes it.
 */

export type StartTotpEnrollmentContext = { requestId: string | null; ipHash: Buffer | null }
export type StartTotpEnrollmentResult = { otpauthUri: string; secret: string }

// The issuer the authenticator shows; outside production it names the environment too.
function issuer() {
  const environment = runtime.appEnv
  return environment === 'production' ? TOTP.issuer : `${TOTP.issuer} (${environment})`
}

const passwordIncorrect = () =>
  new DomainError('VALIDATION_FAILED', {
    errors: [
      { field: 'password', code: 'password_incorrect', message: 'Your password is not correct.' },
    ],
  })

export async function startTotpEnrollment(
  userId: string,
  input: { token: string; password: string },
  context: StartTotpEnrollmentContext
): Promise<StartTotpEnrollmentResult> {
  const account = await staffMfaAccount(userId)
  if (account.mfaEnabled) throw alreadyEnrolled()
  const live = await withTx((trx) => liveEnrolmentToken(trx, userId, input.token))
  if (!live) throw invalidEnrolmentToken()

  const checked = await reauthenticate(userId, input.password, {
    actor: 'self',
    requestId: context.requestId,
    ipHash: context.ipHash,
  })
  if (!checked.ok) throw passwordIncorrect()

  const secret = generateTotpSecret()
  const sealed = sealTotpSecret(secret)
  await withTx(async (trx) => {
    const stored: { email: string }[] = await trx
      .from('users')
      .where('id', userId)
      .where('status', 'active')
      .whereNull('mfa_enabled_at')
      .where('password_hash', checked.passwordHash)
      .update({ mfa_totp_secret_enc: sealed, mfa_last_used_step: null }, ['email'])
    if (stored.length === 0) {
      const current = await trx.from('users').where('id', userId).select('mfa_enabled_at').first()
      if (current?.mfa_enabled_at) throw alreadyEnrolled()
      // The password changed (or the account was suspended) since the check.
      throw new DomainError('CONFLICT', {
        detail: 'Your account changed while this was running. Start again.',
      })
    }
    if (!(await liveEnrolmentToken(trx, userId, input.token))) throw invalidEnrolmentToken()

    const actor = await selfActor(trx, userId)
    await recordAudit(trx, {
      ...actor,
      actorUserId: userId,
      action: 'auth.mfa_enrollment_start',
      subjectType: 'user',
      subjectId: userId,
      requestId: context.requestId,
      ipHash: context.ipHash,
      changes: { changed: ['mfa_totp_secret_enc'] },
    })
  })

  return { otpauthUri: otpauthUri({ issuer: issuer(), account: account.email, secret }), secret }
}

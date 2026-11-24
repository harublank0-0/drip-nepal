import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError } from '#exceptions/domain_error'
import {
  deferredTotpThrottle,
  type MfaAttemptContext,
} from '#modules/identity/internal/mfa_throttle'
import { recordTotpStep } from '#modules/identity/internal/totp_step'

export type { MfaAttemptContext } from '#modules/identity/internal/mfa_throttle'

/*
 * A `totp_code` sent in an action's body (docs/07 §3.10, §4.1 rule 4, §4.7;
 * docs/06 §4.3, §7.3 step 3): the code a staff member types for one action,
 * checked inside that action's transaction, so the code is spent only if
 * the action commits, and a wrong or replayed code rolls the action back.
 *
 * - `verify(trx)` is called by the action where it needs the code: no code
 *   is 422 `VALIDATION_FAILED` on `totp_code` (`required`); otherwise the
 *   `mfa_user` and `mfa` limiters are charged (429 `RATE_LIMITED` once the
 *   account's codes are blocked, OD-50) and the code is checked and spent
 *   (`recordTotpStep`). A second call in the same transaction does nothing.
 * - `run(work)` wraps the request: it settles the limiter points after the
 *   transaction (`deferredTotpThrottle`), so a wrong code answers 422 on
 *   `totp_code` with one `auth.mfa_failed` row and keeps its points.
 * - `verified` is true once a code passed in the transaction that
 *   committed: the controller then refreshes the session's
 *   `mfa_verified_at` (07 §3.10: a valid code satisfies the step-up, and
 *   the session ID is not rotated).
 */

const REQUIRED_MESSAGE = 'Enter the 6-digit code from your authenticator app.'

export function totpCodeRequired(detail = REQUIRED_MESSAGE) {
  return new DomainError('VALIDATION_FAILED', {
    detail,
    errors: [{ field: 'totp_code', code: 'required', message: REQUIRED_MESSAGE }],
  })
}

export type BodyTotpCheck = {
  verify(trx: TransactionClientContract): Promise<void>
  run<T>(work: () => Promise<T>): Promise<T>
  readonly verified: boolean
}

export function bodyTotpCheck(
  userId: string,
  code: string | undefined,
  context: MfaAttemptContext,
  requiredDetail?: string
): BodyTotpCheck {
  const throttle = deferredTotpThrottle(userId, context)
  let verifiedIn: TransactionClientContract | null = null
  return {
    async verify(trx) {
      if (verifiedIn === trx) return
      if (!code) throw totpCodeRequired(requiredDetail)
      await throttle.charge()
      await recordTotpStep(trx, userId, code, context)
      verifiedIn = trx
    },
    run: (work) => throttle.run(work),
    get verified() {
      return verifiedIn !== null
    },
  }
}

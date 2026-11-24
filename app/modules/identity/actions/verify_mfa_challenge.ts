import { notEnrolled, staffMfaAccount } from '#modules/identity/internal/mfa_account'
import { throttledTotpCheck, type MfaAttemptContext } from '#modules/identity/internal/mfa_throttle'
import { recordTotpStep } from '#modules/identity/internal/totp_step'
import { withTx } from '#modules/platform/tx'

/*
 * `verifyMfaChallenge` (docs/06 §13.3, §4.3; docs/07 §3.9; 01
 * AC-FR-IAM-007-2, -3, -4), the identity entry action that checks a staff
 * member's TOTP code. It never touches the session: the controller records
 * the proof (`recordMfaVerified`: `mfa_verified_at` as `{ user_id, at }`
 * and `admin_seen_at`) and rotates the session ID (`rotateSessionId`, 07
 * §3.1, §3.9) from what this returns.
 *
 * 1. Checks that charge nothing: active staff (403), TOTP on (409
 *    `CONFLICT`: enrol first).
 * 2. The code, behind the `mfa_user` and `mfa` limiters
 *    (`throttledTotpCheck`, 07 §3.9): charged before the check, a wrong code
 *    keeps their points and answers 422 on `code` with one
 *    `auth.mfa_failed` row; more than 5 in 5 minutes block the account's
 *    TOTP checks for 15 minutes in every session and from every IP (OD-50),
 *    a right code included, with one `auth.mfa_locked` row and the
 *    `mfa_lockout` alert.
 * 3. In one transaction, `recordTotpStep`: the code checked against the
 *    stored secret and its step recorded by compare-and-set, so of two
 *    requests carrying one code exactly one passes and the other answers the
 *    wrong-code 422 (AC-FR-IAM-007-3). One `auth.mfa_verify` audit row
 *    (proposed).
 */

export type VerifyMfaChallengeResult = { status: 'mfa_verified' }

export async function verifyMfaChallenge(
  userId: string,
  code: string,
  context: MfaAttemptContext
): Promise<VerifyMfaChallengeResult> {
  const account = await staffMfaAccount(userId)
  if (!account.mfaEnabled || !account.secretEnc) throw notEnrolled()

  return throttledTotpCheck(userId, context, () =>
    withTx(async (trx) => {
      await recordTotpStep(trx, userId, code, context)
      return { status: 'mfa_verified' as const }
    })
  )
}

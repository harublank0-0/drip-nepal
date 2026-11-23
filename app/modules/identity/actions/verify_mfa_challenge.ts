import { recordAudit } from '#modules/audit/actions/record_audit'
import { notEnrolled, staffMfaAccount } from '#modules/identity/internal/mfa_account'
import {
  WrongTotpCode,
  throttledTotpCheck,
  type MfaAttemptContext,
} from '#modules/identity/internal/mfa_throttle'
import { selfActor } from '#modules/identity/internal/self_actor'
import { checkTotpCode } from '#modules/identity/internal/totp_secret'
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
 * 3. In one transaction: the code must match the stored secret within ±1
 *    step and be later than `mfa_last_used_step`; a compare-and-set records
 *    its step only while the secret is the one checked and no later step
 *    was recorded meanwhile, so of two requests carrying one code exactly
 *    one passes and the other answers the wrong-code 422 (AC-FR-IAM-007-3).
 *    One `auth.mfa_verify` audit row (proposed).
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
      const user = await trx
        .from('users')
        .where('id', userId)
        .whereNotNull('mfa_enabled_at')
        .select('mfa_totp_secret_enc', 'mfa_last_used_step')
        .first()
      if (!user?.mfa_totp_secret_enc) throw notEnrolled()
      const secretEnc: string = user.mfa_totp_secret_enc
      const lastUsedStep: number | null = user.mfa_last_used_step

      const step = checkTotpCode(secretEnc, code, lastUsedStep)
      if (step === null) throw new WrongTotpCode()

      const recorded: { id: string }[] = await trx
        .from('users')
        .where('id', userId)
        .whereNotNull('mfa_enabled_at')
        .where('mfa_totp_secret_enc', secretEnc)
        .where((query) => {
          query.whereNull('mfa_last_used_step').orWhere('mfa_last_used_step', '<', step)
        })
        .update({ mfa_last_used_step: step }, ['id'])
      // A concurrent request used this code (or a later one) first: a replay.
      if (recorded.length === 0) throw new WrongTotpCode()

      const actor = await selfActor(trx, userId)
      await recordAudit(trx, {
        ...actor,
        actorUserId: userId,
        action: 'auth.mfa_verify',
        subjectType: 'user',
        subjectId: userId,
        requestId: context.requestId,
        ipHash: context.ipHash,
        changes: { changed: ['mfa_last_used_step'] },
      })
      return { status: 'mfa_verified' as const }
    })
  )
}

import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit } from '#modules/audit/actions/record_audit'
import {
  alreadyEnrolled,
  invalidEnrolmentToken,
  liveEnrolmentToken,
  notEnrolled,
  sendMfaEnabledEmail,
  staffMfaAccount,
  tokenHashOf,
} from '#modules/identity/internal/mfa_account'
import {
  WrongTotpCode,
  throttledTotpCheck,
  type MfaAttemptContext,
} from '#modules/identity/internal/mfa_throttle'
import { selfActor } from '#modules/identity/internal/self_actor'
import { checkTotpCode } from '#modules/identity/internal/totp_secret'
import { raiseAlert } from '#modules/platform/alerts'
import { withTx } from '#modules/platform/tx'

/*
 * `confirmTotpEnrollment` (docs/06 §13.3; docs/07 §3.8, §3.9; 01
 * AC-FR-IAM-007-1), the identity entry action that turns TOTP on for a
 * signed-in staff member who has started enrolment:
 *
 * 1. Checks that charge nothing: active staff (403), TOTP not already on
 *    (409 `CONFLICT`), a pending secret from `startTotpEnrollment` (409),
 *    and `token` the live `mfa_enrollment` token of this account (422 on
 *    `token`).
 * 2. The code, behind the `mfa_user` and `mfa` limiters
 *    (`throttledTotpCheck`): a wrong code keeps their points and answers
 *    422 on `code`; past 5 in 5 minutes the account's TOTP checks are
 *    blocked for 15 minutes (OD-50).
 * 3. In one transaction, in the lock order of docs/04a §5.2: the user's row
 *    is locked `FOR NO KEY UPDATE` and read again; the code must match its
 *    pending secret (RFC 6238, ±1 step); the token is redeemed in one
 *    statement bound to this user (`AND user_id = :actor`, 07 §3.8), so of
 *    two tabs exactly one confirms; then a compare-and-set on the secret
 *    the code was checked against sets `mfa_enabled_at` and records the
 *    code's step in `mfa_last_used_step`, so the same code cannot pass the
 *    challenge that follows (AC-FR-IAM-007-3).
 * 4. In the same transaction: one `platform_staff.mfa_enable` audit row
 *    (proposed; a staff security change, kept 7 years like
 *    `platform_staff.mfa_reset`, docs/11 §14.6), the "two-step verification
 *    turned on" email (`user.mfa_enabled`), whose event ID is the token's
 *    row ID, so one enrolment window sends one email however often a
 *    replay runs (an account notice needs a per-user bound, docs/07 TM-09,
 *    and each window comes from a staff grant, `platform:create-admin` or an
 *    MFA reset), and the `staff_privilege_change` alert after the commit
 *    (docs/11 §9.7).
 *
 * The session is left as it is: 07 §3.2 lets only `verifyMfaChallenge` (and
 * a valid `totp_code` on an approval) write `mfa_verified_at`, so the page
 * asks for the next code before the admin pages open.
 */

export type ConfirmTotpEnrollmentResult = { status: 'mfa_enabled' }

export async function confirmTotpEnrollment(
  userId: string,
  input: { code: string; token: string },
  context: MfaAttemptContext
): Promise<ConfirmTotpEnrollmentResult> {
  const account = await staffMfaAccount(userId)
  if (account.mfaEnabled) throw alreadyEnrolled()
  if (!account.secretEnc) throw notEnrolled()
  const live = await withTx((trx) => liveEnrolmentToken(trx, userId, input.token))
  if (!live) throw invalidEnrolmentToken()

  return throttledTotpCheck(userId, context, () =>
    withTx(async (trx) => {
      const locked = await trx.rawQuery(
        `SELECT mfa_enabled_at, mfa_totp_secret_enc, mfa_last_used_step
           FROM users WHERE id = ? AND status = 'active' FOR NO KEY UPDATE`,
        [userId]
      )
      const user:
        | {
            mfa_enabled_at: Date | null
            mfa_totp_secret_enc: string | null
            mfa_last_used_step: number | null
          }
        | undefined = locked.rows[0]
      if (user?.mfa_enabled_at) throw alreadyEnrolled()
      if (!user?.mfa_totp_secret_enc) throw notEnrolled()

      const step = checkTotpCode(user.mfa_totp_secret_enc, input.code, user.mfa_last_used_step)
      if (step === null) throw new WrongTotpCode()

      const redeemed = await trx.rawQuery(
        `UPDATE user_tokens SET consumed_at = now()
          WHERE token_hash = ? AND purpose = 'mfa_enrollment' AND user_id = ?
            AND consumed_at IS NULL AND expires_at > now()
          RETURNING id`,
        [tokenHashOf(input.token), userId]
      )
      const token: { id: string } | undefined = redeemed.rows[0]
      if (!token) throw invalidEnrolmentToken()

      const enabled: { id: string }[] = await trx
        .from('users')
        .where('id', userId)
        .whereNull('mfa_enabled_at')
        .where('mfa_totp_secret_enc', user.mfa_totp_secret_enc)
        .update({ mfa_enabled_at: trx.knexRawQuery('now()'), mfa_last_used_step: step }, ['id'])
      // The row is locked and was read without TOTP, so the update cannot miss.
      if (enabled.length === 0) {
        throw new InvariantViolation('confirmTotpEnrollment lost a locked pending enrolment')
      }

      const actor = await selfActor(trx, userId)
      await recordAudit(trx, {
        ...actor,
        actorUserId: userId,
        action: 'platform_staff.mfa_enable',
        subjectType: 'user',
        subjectId: userId,
        requestId: context.requestId,
        ipHash: context.ipHash,
        changes: { changed: ['mfa_enabled_at', 'mfa_last_used_step'] },
      })
      await sendMfaEnabledEmail(trx, userId, token.id, context.requestId)
      raiseAlert(
        'staff_privilege_change',
        { user_id: userId, change: 'totp_enrolled', request_id: context.requestId },
        trx
      )
      return { status: 'mfa_enabled' as const }
    })
  )
}

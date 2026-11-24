import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { notEnrolled } from '#modules/identity/internal/mfa_account'
import { WrongTotpCode, type MfaAttemptContext } from '#modules/identity/internal/mfa_throttle'
import { selfActor } from '#modules/identity/internal/self_actor'
import { checkTotpCode } from '#modules/identity/internal/totp_secret'

/*
 * One TOTP code checked and spent inside the caller's transaction (docs/07
 * §3.9, §3.10): `verifyMfaChallenge` and a `totp_code` in an action's body
 * (`bodyTotpCheck`). The code must match the stored secret within ±1 step
 * and be later than `mfa_last_used_step`; a compare-and-set records its step
 * only while the secret is the one checked and no later step was recorded
 * meanwhile, so of two requests carrying one code exactly one passes and the
 * other throws `WrongTotpCode` (AC-FR-IAM-007-3). In a longer business
 * transaction the `users` row stays locked until it commits, and a rollback
 * gives the step back. One `auth.mfa_verify` audit row (proposed), which
 * never holds the code.
 */
export async function recordTotpStep(
  trx: TransactionClientContract,
  userId: string,
  code: string,
  context: MfaAttemptContext
) {
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
}

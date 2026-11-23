import { createHash } from 'node:crypto'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError } from '#exceptions/domain_error'
import { InvariantViolation } from '#exceptions/programming_errors'
import { sendJob } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'

/*
 * What the three MFA operations (docs/06 §13.3; docs/07 §3.9) read before
 * any limiter or hash: in R1 only platform staff have TOTP (FR-IAM-007;
 * owner MFA is R2, FR-IAM-008), so a caller without an unrevoked
 * `platform_staff` row, or whose account is not `active`, gets 403
 * `FORBIDDEN` and charges nothing. Never the secret's plaintext.
 */
export type MfaAccount = {
  email: string
  mfaEnabled: boolean
  secretEnc: string | null
  lastUsedStep: number | null
}

const NOT_STAFF = 'Two-step verification is for DripNepal staff accounts.'

export async function staffMfaAccount(userId: string): Promise<MfaAccount> {
  const row = await withTx((trx) =>
    trx
      .from('users')
      .join('platform_staff', (join) => {
        join.on('platform_staff.user_id', 'users.id').andOnNull('platform_staff.revoked_at')
      })
      .where('users.id', userId)
      .where('users.status', 'active')
      .select(
        'users.email',
        'users.mfa_enabled_at',
        'users.mfa_totp_secret_enc',
        'users.mfa_last_used_step'
      )
      .first()
  )
  if (!row) throw new DomainError('FORBIDDEN', { detail: NOT_STAFF })
  return {
    email: row.email,
    mfaEnabled: row.mfa_enabled_at !== null,
    secretEnc: row.mfa_totp_secret_enc,
    lastUsedStep: row.mfa_last_used_step,
  }
}

export const alreadyEnrolled = () =>
  new DomainError('CONFLICT', { detail: 'Two-step verification is already on for this account.' })

export const notEnrolled = () =>
  new DomainError('CONFLICT', { detail: 'Set up two-step verification first.' })

// `mfa_enrollment` tokens are looked up by their SHA-256, as every `user_tokens` token is (07 §3.8).
export const tokenHashOf = (rawToken: string) => createHash('sha256').update(rawToken).digest()

const INVALID_TOKEN_MESSAGE =
  'This setup link has expired or has already been used. Ask the platform team for a new one.'

export function invalidEnrolmentToken() {
  return new DomainError('VALIDATION_FAILED', {
    detail: INVALID_TOKEN_MESSAGE,
    errors: [{ field: 'token', code: 'token_invalid', message: INVALID_TOKEN_MESSAGE }],
  })
}

/*
 * Whether `rawToken` is the live `mfa_enrollment` token of `userId`: the
 * purpose, the owner (07 §3.8: another account's token matches no row and
 * stays unconsumed), unconsumed and unexpired. A read, without a lock.
 */
export async function liveEnrolmentToken(
  client: QueryClientContract,
  userId: string,
  rawToken: string
): Promise<boolean> {
  const row = await client
    .from('user_tokens')
    .where('token_hash', tokenHashOf(rawToken))
    .where('purpose', 'mfa_enrollment')
    .where('user_id', userId)
    .whereNull('consumed_at')
    .whereRaw('expires_at > now()')
    .select('id')
    .first()
  return row !== null
}

/*
 * The "two-step verification turned on" email (docs/07 §3.9; 01
 * AC-FR-NOT-001-1), queued by `confirmTotpEnrollment` in its transaction.
 * Its `event_id` is the consumed `mfa_enrollment` token's row ID, so the
 * delivery row's `dedupe_key` allows one email per enrolment window: the
 * per-user bound an account notice needs (07 TM-09).
 */
export async function sendMfaEnabledEmail(
  trx: TransactionClientContract,
  userId: string,
  tokenId: string,
  requestId: string | null
) {
  const jobId = await sendJob(trx, 'notifications.dispatch', {
    event: 'user.mfa_enabled',
    event_id: tokenId,
    user_id: userId,
    request_id: requestId,
    causation_id: null,
  })
  if (!jobId) throw new InvariantViolation('notifications.dispatch refused the MFA email job')
}

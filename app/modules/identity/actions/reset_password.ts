import { createHash } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import { DomainError } from '#exceptions/domain_error'
import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { SIGNED_IN_STATUSES, maySignIn } from '#modules/identity/domain/user_status'
import {
  consumeTokensOnPasswordChange,
  sendPasswordChangedEmail,
  sendRevokeSessions,
} from '#modules/identity/internal/password_effects'
import { selfActor } from '#modules/identity/internal/self_actor'
import { withTx } from '#modules/platform/tx'

/*
 * `resetPassword` (docs/06 §13.3; 01 FR-IAM-004; 02 J-18 steps 3–4), the
 * identity entry action that redeems a `password_reset` token:
 *
 * 1. The token is looked up by its SHA-256, for the `password_reset`
 *    purpose only, live (unconsumed and unexpired), without a lock. No row
 *    (an unknown, used, replaced or expired token, or one of another
 *    purpose, which stays unconsumed, T-SEC-012) answers 422 on `token`
 *    before any hash is spent.
 * 2. The new password is hashed before the transaction, so no row lock
 *    waits on scrypt.
 * 3. In one transaction, in the lock order of docs/04a §5.2: the user's row
 *    is locked `FOR NO KEY UPDATE`; an account that may not sign in
 *    (suspended, deactivated, anonymised; those consume their tokens
 *    anyway, 07 §3.8) answers the same 422. The token is redeemed in one
 *    statement (`consumed_at IS NULL AND expires_at > now()`), so of two
 *    tabs with one link exactly one succeeds and the other answers 422
 *    (02 J-18 "Concurrency", T-IAM-105).
 * 4. The user gets the new hash and a new `security_stamp`, so every
 *    session is refused on its next request (AC-FR-IAM-004-4, AC-J18-03).
 *    A `pending_verification` account also becomes `active` with
 *    `email_verified_at`, because the link proves the mailbox (02 J-18 step
 *    3 [Assumption]; 07 §3.12). The other live tokens a password change
 *    invalidates are consumed, and a live `mfa_enrollment` token is kept
 *    while TOTP is not enrolled (OD-60).
 * 5. `identity.revoke_sessions` and the "password changed" email are sent,
 *    and one `auth.password_reset` audit row is written, all in the same
 *    transaction (ADR-0010).
 *
 * Nobody is signed in (AC-FR-IAM-004-4): the page sends the user to
 * `/login`. Every refusal is the same 422 with no account data.
 */

export type ResetPasswordContext = { requestId: string | null; ipHash: Buffer | null }
export type ResetPasswordResult = { status: 'password_reset' }

const RESET: ResetPasswordResult = { status: 'password_reset' }

const INVALID_TOKEN_MESSAGE = 'This link has expired or has already been used.'

function invalidToken() {
  return new DomainError('VALIDATION_FAILED', {
    detail: INVALID_TOKEN_MESSAGE,
    errors: [{ field: 'token', code: 'token_invalid', message: INVALID_TOKEN_MESSAGE }],
  })
}

export async function resetPassword(
  rawToken: string,
  password: string,
  context: ResetPasswordContext
): Promise<ResetPasswordResult> {
  const tokenHash = createHash('sha256').update(rawToken).digest()

  const live = await db
    .from('user_tokens')
    .where('token_hash', tokenHash)
    .where('purpose', 'password_reset')
    .whereNull('consumed_at')
    .whereRaw('expires_at > now()')
    .select('user_id')
    .first()
  if (!live) throw invalidToken()

  const passwordHash = await hash.use('scrypt').make(password)

  return withTx(async (trx) => {
    const locked = await trx.rawQuery(
      'SELECT status, mfa_enabled_at FROM users WHERE id = ? FOR NO KEY UPDATE',
      [live.user_id]
    )
    const user: { status: string; mfa_enabled_at: Date | null } | undefined = locked.rows[0]
    if (!user || !maySignIn(user.status)) throw invalidToken()

    const redeemed = await trx.rawQuery(
      `UPDATE user_tokens SET consumed_at = now()
        WHERE token_hash = ? AND purpose = 'password_reset'
          AND consumed_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [tokenHash]
    )
    if (redeemed.rows.length === 0) throw invalidToken()

    const verifies = user.status === 'pending_verification'
    const now = trx.knexRawQuery('now()')
    const updated: { id: string }[] = await trx
      .from('users')
      .where('id', live.user_id)
      .whereIn('status', [...SIGNED_IN_STATUSES])
      .update(
        {
          password_hash: passwordHash,
          security_stamp: trx.knexRawQuery('gen_random_uuid()'),
          ...(verifies ? { status: 'active', email_verified_at: now } : {}),
        },
        ['id']
      )
    // The row is locked and may sign in, so the update cannot miss.
    if (updated.length === 0) {
      throw new InvariantViolation('resetPassword lost a locked account that may sign in')
    }

    await consumeTokensOnPasswordChange(trx, live.user_id, user.mfa_enabled_at !== null)
    await sendRevokeSessions(trx, live.user_id, context.requestId)
    await sendPasswordChangedEmail(trx, live.user_id, context.requestId)

    const actor = await selfActor(trx, live.user_id)
    const changed = ['password_hash', 'security_stamp']
    if (verifies) changed.push('email_verified_at')
    await recordAudit(trx, {
      ...actor,
      actorUserId: live.user_id,
      action: 'auth.password_reset',
      subjectType: 'user',
      subjectId: live.user_id,
      requestId: context.requestId,
      ipHash: context.ipHash,
      changes: {
        changed,
        ...(verifies ? { status: { from: 'pending_verification', to: 'active' } } : {}),
      },
    })
    return RESET
  })
}

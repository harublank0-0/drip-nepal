import { createHash } from 'node:crypto'
import { DomainError } from '#exceptions/domain_error'
import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { withTx } from '#modules/platform/tx'

/*
 * `confirmEmail` (docs/06 §13.3; 01 FR-IAM-002; 02 J-04 step 4), the
 * identity entry action that redeems an `email_verification` token. In one
 * transaction, in the lock order of docs/04a §5.2 (`users`, then
 * `user_tokens`):
 *
 * 1. The token's user is read by the SHA-256 of the raw token, for the
 *    `email_verification` purpose only, without a lock. No row (an unknown
 *    token, or one of another purpose, which stays unconsumed, T-SEC-012)
 *    answers 422.
 * 2. The user's row is locked `FOR NO KEY UPDATE`.
 * 3. An `active` user is already verified: the link answers 200 with no
 *    write, so a double click or a second tab is not an error (AC-J04-06,
 *    the J-04 concurrency row). Only a `pending_verification` user goes on;
 *    any other status answers 422 (a suspension or anonymisation consumes
 *    the tokens anyway, docs/07 §3.8).
 * 4. The token is redeemed in one statement (`consumed_at IS NULL AND
 *    expires_at > now()`); an expired or replaced token matches nothing and
 *    answers 422, and nothing changes.
 * 5. The user moves `pending_verification` → `active` with
 *    `email_verified_at` (compare-and-set, docs/07 §3.12), and one
 *    `user.email_verify` audit row is written.
 *
 * Every refusal is the same 422 on `token` with no account data
 * (AC-FR-IAM-002-4). Nobody is signed in (docs/07 TM-09).
 */

export type ConfirmEmailContext = { requestId: string | null; ipHash: Buffer | null }
export type ConfirmEmailResult = { status: 'active' }

const ACTIVE: ConfirmEmailResult = { status: 'active' }

function invalidToken() {
  return new DomainError('VALIDATION_FAILED', {
    detail: 'This link has expired or has already been used.',
    errors: [
      {
        field: 'token',
        code: 'token_invalid',
        message: 'This link has expired or has already been used.',
      },
    ],
  })
}

export async function confirmEmail(
  rawToken: string,
  context: ConfirmEmailContext
): Promise<ConfirmEmailResult> {
  const tokenHash = createHash('sha256').update(rawToken).digest()

  return withTx(async (trx) => {
    const found = await trx.rawQuery(
      `SELECT user_id FROM user_tokens WHERE token_hash = ? AND purpose = 'email_verification'`,
      [tokenHash]
    )
    const token: { user_id: string } | undefined = found.rows[0]
    if (!token) throw invalidToken()

    const locked = await trx.rawQuery('SELECT status FROM users WHERE id = ? FOR NO KEY UPDATE', [
      token.user_id,
    ])
    const user: { status: string } | undefined = locked.rows[0]
    if (user?.status === 'active') return ACTIVE
    if (user?.status !== 'pending_verification') throw invalidToken()

    const redeemed = await trx.rawQuery(
      `UPDATE user_tokens SET consumed_at = now()
        WHERE token_hash = ? AND purpose = 'email_verification'
          AND consumed_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [tokenHash]
    )
    if (redeemed.rows.length === 0) throw invalidToken()

    const activated = await trx.rawQuery(
      `UPDATE users SET status = 'active', email_verified_at = now()
        WHERE id = ? AND status = 'pending_verification'
        RETURNING id`,
      [token.user_id]
    )
    // The row is locked and was pending, so the compare-and-set cannot miss.
    if (activated.rows.length === 0) {
      throw new InvariantViolation('confirmEmail lost a locked pending_verification user')
    }

    await recordAudit(trx, {
      actorType: 'customer',
      actorUserId: token.user_id,
      action: 'user.email_verify',
      subjectType: 'user',
      subjectId: token.user_id,
      requestId: context.requestId,
      ipHash: context.ipHash,
      changes: { status: { from: 'pending_verification', to: 'active' } },
    })
    return ACTIVE
  })
}

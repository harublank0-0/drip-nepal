import { createHash, randomBytes } from 'node:crypto'
import encryption from '@adonisjs/core/services/encryption'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { InvariantViolation } from '#exceptions/programming_errors'
import { sendJob } from '#modules/platform/jobs'
import {
  USER_TOKEN_LIFETIME_SECONDS,
  type UserTokenPurpose,
} from '#modules/identity/domain/user_token_purpose'

/*
 * Issues a single-use `user_tokens` token and queues its email, inside the
 * caller's transaction (a step action, docs/09 §2.3 rule 1):
 *
 * 1. Locks the user's row `FOR NO KEY UPDATE`, so concurrent issuers queue
 *    and the order is always `users`, then `user_tokens` (docs/04a §5.2).
 * 2. Consumes the user's live token of the same purpose (at most one live
 *    token per purpose, `user_tokens_live_key`).
 * 3. Inserts the SHA-256 of 32 random bytes; the raw token is never stored.
 * 4. Sends one `notifications.dispatch` job carrying the row ID and the raw
 *    token encrypted for `email_token:<purpose>` with the token's lifetime
 *    (docs/07 §3.8 rules 1 and 2), so the job exists only if the
 *    transaction commits.
 *
 * The raw token leaves this function only inside that ciphertext: nothing
 * returns, logs or prints it (docs/09 §9.1 "Output").
 */
export async function issueUserToken(
  trx: TransactionClientContract,
  userId: string,
  purpose: UserTokenPurpose
) {
  const lifetime = USER_TOKEN_LIFETIME_SECONDS[purpose]
  await trx.rawQuery('SELECT id FROM users WHERE id = ? FOR NO KEY UPDATE', [userId])
  await trx.rawQuery(
    `UPDATE user_tokens SET consumed_at = now()
      WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`,
    [userId, purpose]
  )

  const token = randomBytes(32).toString('base64url')
  const inserted = await trx.rawQuery(
    `INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at)
     VALUES (?, ?, ?, now() + make_interval(secs => ?))
     RETURNING id`,
    [userId, purpose, createHash('sha256').update(token).digest(), lifetime]
  )
  const row: { id: string } = inserted.rows[0]

  const tokenEnc = encryption.encrypt(token, {
    expiresIn: `${lifetime}s`,
    purpose: `email_token:${purpose}`,
  })
  const jobId = await sendJob(trx, 'notifications.dispatch', {
    event: 'user_token.issued',
    user_token_id: row.id,
    token_enc: tokenEnc,
    request_id: null,
    causation_id: null,
  })
  // A standard queue never refuses a send; a null id would mean the email is lost.
  if (!jobId) throw new InvariantViolation('notifications.dispatch refused the token email job')

  return { id: row.id, purpose, lifetimeSeconds: lifetime }
}

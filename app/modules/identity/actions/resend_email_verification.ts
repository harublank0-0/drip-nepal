import { DomainError } from '#exceptions/domain_error'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'

/*
 * `resendEmailVerification` (docs/06 §13.3; 01 AC-FR-IAM-002-3; 02
 * AC-J04-10), the identity entry action for the signed-in user:
 *
 * 1. `verify_resend` takes a point for the user before any write, so the
 *    fourth request in an hour answers 429 and queues nothing (docs/06
 *    §9.1).
 * 2. In one transaction the user's row is locked `FOR NO KEY UPDATE`; a user
 *    who is no longer `pending_verification` (verified meanwhile, in
 *    another tab) answers 403 `FORBIDDEN`, and nothing is issued. The
 *    account-status middleware has already refused any other status.
 * 3. `issueUserToken` consumes the earlier live `email_verification` token,
 *    so its link stops working, issues a new one and queues its email
 *    (docs/07 §3.8, docs/04a §5.2).
 *
 * The caller is the account holder, so the answer reveals nothing about
 * another account.
 */

export type ResendResult = { status: 'verification_email_sent' }

const RESENT: ResendResult = { status: 'verification_email_sent' }

export async function resendEmailVerification(
  userId: string,
  context: { requestId: string | null }
): Promise<ResendResult> {
  await rateLimiter('verify_resend').consume(rateLimitKey('verify_resend', userId))

  await withTx(async (trx) => {
    const locked = await trx.rawQuery('SELECT status FROM users WHERE id = ? FOR NO KEY UPDATE', [
      userId,
    ])
    const user: { status: string } | undefined = locked.rows[0]
    if (user?.status !== 'pending_verification') {
      throw new DomainError('FORBIDDEN', { detail: 'Your email address is already verified.' })
    }
    await issueUserToken(trx, userId, 'email_verification', { requestId: context.requestId })
  })

  return RESENT
}

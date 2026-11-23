import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { maySignIn } from '#modules/identity/domain/user_status'
import { clientNetwork, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'

/*
 * `requestPasswordReset` (docs/06 §13.3; 01 FR-IAM-004; 02 J-18 steps
 * 1–2), the identity entry action. Every caller gets the same 202, whether
 * the email has an account or not, and whatever its status (AC-J18-01,
 * AC-FR-IAM-004-1, docs/07 TM-09):
 *
 * 1. `pwreset_ip` (10 per hour per client network), then `pwreset_email`
 *    (3 per hour per email) take their point before anything is looked up,
 *    for a known and an unknown email alike, so the fourth request for one
 *    address in an hour is 429 either way and says nothing about an account
 *    (docs/06 §9.1).
 * 2. In one transaction the account's row is locked `FOR NO KEY UPDATE`, so
 *    concurrent requests for one account queue and exactly one live token
 *    remains (T-IAM-105, docs/04a §5.2). Only an `active` or
 *    `pending_verification` account gets a token: `issueUserToken` consumes
 *    the earlier live `password_reset` token, so only the newest link works
 *    (AC-J18-04), inserts the new one (60 minutes, 07 §3.8) and queues its
 *    email. An unknown, suspended, deactivated or anonymised account gets
 *    nothing, and no row is written (02 J-18 step 2).
 *
 * No password is hashed on either branch; what differs is the token and
 * job inserts of the known branch, the residual TM-09 accepts. No audit row:
 * the request changes no account, and the limiter rows count the requests.
 */

export type RequestPasswordResetContext = {
  // `request.ip()`, which honours trusted proxies only.
  ip: string
  requestId: string | null
}

export type RequestPasswordResetResult = { status: 'reset_email_sent' }

const SENT: RequestPasswordResetResult = { status: 'reset_email_sent' }

export async function requestPasswordReset(
  // Normalised by the validator (trimmed, lower-cased).
  email: string,
  context: RequestPasswordResetContext
): Promise<RequestPasswordResetResult> {
  await rateLimiter('pwreset_ip').consume(rateLimitKey('pwreset_ip', clientNetwork(context.ip)))
  await rateLimiter('pwreset_email').consume(rateLimitKey('pwreset_email', email))

  await withTx(async (trx) => {
    const locked = await trx.rawQuery(
      'SELECT id, status FROM users WHERE email = ? FOR NO KEY UPDATE',
      [email]
    )
    const user: { id: string; status: string } | undefined = locked.rows[0]
    if (!user || !maySignIn(user.status)) return
    await issueUserToken(trx, user.id, 'password_reset', { requestId: context.requestId })
  })

  return SENT
}

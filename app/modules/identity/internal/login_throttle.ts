import { clientNetwork, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'

/*
 * The login limiters of docs/07 §3.6 around a credential check, for the
 * `logIn` action (actions/log_in.ts, M1 part 3):
 *
 * 1. `login_ip` counts every attempt from the client network and is checked
 *    before any credential work, so a blocked network costs no hash.
 * 2. `login_acct_ip` reserves its point before the check: `consume()` is one
 *    atomic upsert in the database store (rate-limiter-flexible 9.1.1,
 *    `INSERT … ON CONFLICT DO UPDATE … RETURNING`), so however many attempts
 *    for one account and network arrive at once, at most 5 checks run per
 *    window. A failed check keeps its point and is rethrown unchanged (a
 *    wrong password and, as before, any other error, which the handler
 *    reports, RF-12); a success deletes the key, so only failures count
 *    (AC-FR-IAM-003-3). The package's `penalize()` is not used: it reads,
 *    runs the check, then increments, so parallel attempts all reach the
 *    check.
 *
 * Past either limit the call throws the limiter's `E_TOO_MANY_REQUESTS`,
 * which the exception handler answers with 429 `RATE_LIMITED` and
 * `Retry-After` (docs/06 §9.1). The email is matched as the login form
 * sends it, trimmed and lower-cased, so its case gives no fresh bucket.
 */
export async function throttledLogin<T>(
  attempt: { email: string; ip: string },
  verify: () => Promise<T>
): Promise<T> {
  const network = clientNetwork(attempt.ip)
  await rateLimiter('login_ip').consume(rateLimitKey('login_ip', network))

  const account = rateLimiter('login_acct_ip')
  const key = rateLimitKey('login_acct_ip', attempt.email.trim().toLowerCase(), network)
  await account.consume(key)
  const result = await verify()
  await account.delete(key)
  return result
}

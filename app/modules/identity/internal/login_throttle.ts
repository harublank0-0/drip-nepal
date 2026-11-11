import { clientNetwork, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'

/*
 * The login limiters of docs/07 §3.6 around a credential check, for the
 * `logIn` action of M1:
 *
 * 1. `login_ip` counts every attempt from the client network and is checked
 *    before any credential work, so a blocked network costs no hash.
 * 2. `login_acct_ip` runs `verify` through `penalize()`: while the key has
 *    points left the check runs; an error from it uses a point and is
 *    rethrown unchanged (a wrong password and, as the package does, any
 *    other error, which the handler reports, RF-12); a success clears the
 *    key (AC-FR-IAM-003-3).
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

  const email = attempt.email.trim().toLowerCase()
  const [limited, result] = await rateLimiter('login_acct_ip').penalize(
    rateLimitKey('login_acct_ip', email, network),
    verify
  )
  if (limited) throw limited
  return result
}

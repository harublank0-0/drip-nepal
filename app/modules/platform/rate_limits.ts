import { isIPv4, isIPv6 } from 'node:net'
import limiter from '@adonisjs/limiter/services/main'
import { hmacKeys } from '#config/crypto'
import { keyedHash } from '#modules/platform/crypto/keyed_hash'

/*
 * Rate-limit keys and values (docs/06 §9.1, docs/04a §15.4). Callers never
 * build a limiter key themselves: `rateLimitKey` hashes the identifying part
 * with `HMAC_KEY_LIMITER`, so `rate_limits` holds no email, IP or user ID,
 * and every key has a fixed length whatever the input (T-SEC-101).
 */

type RateLimit = {
  // The key prefix of the 06 §9.1 "Key" column, before the hash.
  prefix: string
  requests: number
  duration: string
}

/*
 * The limiters built so far, with the 06 §9.1 values [Assumption]. The
 * other rows of that table join with their operations (M1 and later).
 */
export const RATE_LIMITS = {
  // logIn, per account and client network; charged before the check, kept on failure only.
  login_acct_ip: { prefix: 'login:acct_ip', requests: 5, duration: '1 minute' },
  // logIn, per client network; checked before any credential work.
  login_ip: { prefix: 'login:ip', requests: 20, duration: '1 minute' },
  // Password re-entry (docs/07 §3.6): both keys checked before hashing, charged before the check.
  reauth_user: { prefix: 'reauth:user', requests: 5, duration: '15 minutes' },
  reauth_user_day: { prefix: 'reauth:user_day', requests: 10, duration: '24 hours' },
  // signUp, per client network; charged on every valid request, known email or not (RF-38).
  signup_ip: { prefix: 'signup:ip', requests: 5, duration: '1 hour' },
  // resendEmailVerification, per user (AC-FR-IAM-002-3).
  verify_resend: { prefix: 'verify:user', requests: 3, duration: '1 hour' },
  // requestPasswordReset, per email and per client network; charged on every valid
  // request, known email or not, so a 429 says nothing about an account (AC-FR-IAM-004-3).
  pwreset_email: { prefix: 'pwreset:email', requests: 3, duration: '1 hour' },
  pwreset_ip: { prefix: 'pwreset:ip', requests: 10, duration: '1 hour' },
  // Courier callbacks (docs/06 §9.1, M6): per client network before the token, then per account.
  webhook_ip: { prefix: 'webhook:ip', requests: 600, duration: '1 minute' },
  courier_callback: { prefix: 'courier_callback', requests: 120, duration: '1 minute' },
} as const satisfies Record<string, RateLimit>

export type RateLimitName = keyof typeof RATE_LIMITS

// Expands a valid IPv6 address (no zone) to its eight 16-bit groups.
function ipv6Groups(address: string): number[] {
  const parse = (part: string) =>
    part === ''
      ? []
      : part.split(':').flatMap((group) => {
          if (!group.includes('.')) return [Number.parseInt(group, 16)]
          const [a, b, c, d] = group.split('.').map(Number)
          return [(a << 8) | b, (c << 8) | d]
        })
  const gap = address.indexOf('::')
  if (gap === -1) return parse(address)
  const head = parse(address.slice(0, gap))
  const tail = parse(address.slice(gap + 2))
  return [...head, ...Array.from({ length: 8 - head.length - tail.length }, () => 0), ...tail]
}

/*
 * The client network of docs/07 §3.6, the `ip` of every IP-keyed limiter:
 * an IPv4 address as is, an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) as
 * that IPv4 address, and any other IPv6 address as its /64 prefix, so one
 * host cannot rotate through the addresses of its /64 into fresh buckets.
 * The input is `request.ip()`, which honours only trusted proxies
 * (config/app.ts). Anything else is returned as given.
 */
export function clientNetwork(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/%.*$/, '')
  if (isIPv4(address) || !isIPv6(address)) return address
  const groups = ipv6Groups(address)
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.')
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`
}

/*
 * `<prefix>:<hex HMAC-SHA256>`, the `hmac(a | b)` of 06 §9.1. The parts are
 * hashed as a JSON array, so no choice of parts can produce another's
 * input (`a|b`, `c` and `a`, `b|c` differ). An IP part must already be a
 * `clientNetwork()`.
 */
export function rateLimitKey(name: RateLimitName, ...parts: string[]) {
  const hash = keyedHash(hmacKeys.limiter.release(), JSON.stringify(parts)).toString('hex')
  return `${RATE_LIMITS[name].prefix}:${hash}`
}

// The limiter of a 06 §9.1 row on the configured store (config/limiter.ts).
export function rateLimiter(name: RateLimitName) {
  const { requests, duration } = RATE_LIMITS[name]
  return limiter.use({ requests, duration })
}

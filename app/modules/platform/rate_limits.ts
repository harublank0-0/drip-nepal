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
  // Past the limit, the key stays refused this long (the `mfa_user` lock, OD-50).
  blockDuration?: string
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
  // TOTP checks (docs/07 §3.9): per account, whatever the session or IP, more than 5 wrong
  // codes in 5 minutes block the account's checks for 15 minutes (OD-50, decided 2026-11-22).
  mfa_user: {
    prefix: 'mfa:user',
    requests: 5,
    duration: '5 minutes',
    blockDuration: '15 minutes',
  },
  // The per-source second layer behind `mfa_user` (proposed); it can refuse only after a
  // right code elsewhere cleared the account's key, since `mfa_user` crosses first otherwise.
  mfa: { prefix: 'mfa:user_ip', requests: 5, duration: '1 minute' },
  // startTotpEnrollment, per user, on each right password (proposed): `reauth` gives a right
  // password's points back, so this bounds the hashes and audit rows of repeated starts.
  totp_start: { prefix: 'totp_start:user', requests: 5, duration: '1 hour' },
  // signUp, per client network; charged on every valid request, known email or not (RF-38).
  signup_ip: { prefix: 'signup:ip', requests: 5, duration: '1 hour' },
  // resendEmailVerification, per user (AC-FR-IAM-002-3).
  verify_resend: { prefix: 'verify:user', requests: 3, duration: '1 hour' },
  // requestPasswordReset, per email and per client network; charged on every valid
  // request, known email or not, so a 429 says nothing about an account (AC-FR-IAM-004-3).
  pwreset_email: { prefix: 'pwreset:email', requests: 3, duration: '1 hour' },
  pwreset_ip: { prefix: 'pwreset:ip', requests: 10, duration: '1 hour' },
  // resetPassword, per live token (proposed): charged before the new password is hashed.
  pwreset_token: { prefix: 'pwreset:token', requests: 5, duration: '1 hour' },
  // changePassword, per user, on each right current password (proposed): bounds the emails.
  password_change: { prefix: 'pwchange:user', requests: 5, duration: '1 hour' },
  // revokeAllSessions, per user, on every call (proposed): bounds the emails.
  revoke_all: { prefix: 'revoke_all:user', requests: 5, duration: '1 hour' },
  // updateMe, per user, on every call (proposed): a consent change writes an insert-only audit
  // row kept 7 years, so this bounds the rows one account can add.
  profile_update: { prefix: 'profile:user', requests: 20, duration: '1 hour' },
  // updateShopProfile, per user, on every call before any check (proposed, R1-S part 1b): each
  // change writes a `shop.profile_update` audit row, insert-only and kept 7 years.
  shop_profile_update: { prefix: 'shop_profile:user', requests: 20, duration: '1 hour' },
  // createMediaUpload, per shop whoever uploads, on every valid request (06 §9.1; R1-S part 2d).
  media_upload: { prefix: 'media:shop', requests: 120, duration: '1 hour' },
  // Every other authenticated /api/v1 call, per user; admin calls use `api_staff` (06 §9.1).
  api_user: { prefix: 'api:user', requests: 300, duration: '1 minute' },
  api_staff: { prefix: 'admin:user', requests: 600, duration: '1 minute' },
  // The public reads, per client network (06 §9.1): since M1 part 6b the location cascades;
  // the catalog and shop reads join with M4. Charged signed in or not.
  catalog_ip: { prefix: 'public:ip', requests: 120, duration: '1 minute' },
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
  const limit: RateLimit = RATE_LIMITS[name]
  const { requests, duration, blockDuration } = limit
  return limiter.use(blockDuration ? { requests, duration, blockDuration } : { requests, duration })
}

/*
 * The operations of docs/06 §9.1 that a row of their own names, built or
 * not, so `api_user` and `api_staff` never charge them a second time (the
 * table's "every other authenticated call"), and `logOut`, which always
 * goes through: refusing it would keep a session alive that its holder is
 * ending (M1 part 6a). The API limits middleware reads it by route name,
 * which is the operationId (docs/09 §4.3). The per-network public reads are
 * in `IP_LIMIT_OPERATIONS` below, which the middleware checks first.
 */
export const OWN_LIMIT_OPERATIONS: ReadonlySet<string> = new Set([
  'logIn',
  'logOut',
  'signUp',
  'resendEmailVerification',
  'requestPasswordReset',
  'resetPassword',
  'changePassword',
  'revokeAllSessions',
  'requestAccountDeletion',
  'updateMe',
  'updateShopProfile',
  'startTotpEnrollment',
  'confirmTotpEnrollment',
  'verifyMfaChallenge',
  'replacePayoutAccount',
  'createShopCourierAccount',
  'rekeyShopCourierAccount',
  'disableShopCourierAccount',
  'placeOrder',
  'addCartItem',
  'createMediaUpload',
  'receiveCourierCallback',
  'receivePaymentWebhook',
])

/*
 * The public reads that a per-network row of docs/06 §9.1 names, with that
 * row: the API limits middleware charges them on the client network
 * (`clientNetwork`), whether a user is signed in or not, instead of
 * `api_user` (M1 part 6b). The location cascades are on `catalog_ip`, and
 * so are the category tree and the filterable attributes (R1-S part 3a) and
 * the listing (part 3b); the product detail and shop reads join with their
 * parts.
 */
export const IP_LIMIT_OPERATIONS: ReadonlyMap<string, RateLimitName> = new Map([
  ['listProvinces', 'catalog_ip'],
  ['listDistricts', 'catalog_ip'],
  ['listLocalLevels', 'catalog_ip'],
  ['listCategories', 'catalog_ip'],
  ['listAttributes', 'catalog_ip'],
  ['listProducts', 'catalog_ip'],
])

/*
 * The writes whose own per-user row of docs/06 §9.1 is charged by the API
 * limits middleware, before the route's middleware and every check, so a
 * refused call (403, 404, 422, 428) takes a point too and a loop of them
 * meets 429 (R1-S part 1b review). Each is also in `OWN_LIMIT_OPERATIONS`,
 * so `api_user` never charges it. `updateMe`'s `profile_update` is still
 * taken inside its action, after the validator (a follow-up, 06 note 64).
 */
export const USER_LIMIT_OPERATIONS: ReadonlyMap<string, RateLimitName> = new Map([
  ['updateShopProfile', 'shop_profile_update'],
])

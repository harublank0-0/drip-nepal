import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/*
 * TOTP for platform staff (docs/07 §3.9; 01 AC-FR-IAM-007-3): RFC 6238 over
 * RFC 4226 HOTP with HMAC-SHA1, 6 digits, a 30-second step and one step of
 * tolerance either side. Built on `node:crypto` rather than a library: it
 * is these few lines, and docs/09 §10.1 asks a new dependency to show why
 * 30 lines of our own would not do. The RFC test vectors run in
 * tests/unit/identity/totp.spec.ts.
 *
 * The secret is 160 bits [Assumption; RFC 4226 §4 recommendation], shown
 * to the user once in base32 (RFC 4648, no padding), the form
 * authenticator apps take.
 */
export const TOTP = {
  digits: 6,
  periodSeconds: 30,
  // Steps accepted either side of the current one (07 §3.9 "±1 step").
  window: 1,
  secretBytes: 20,
  issuer: 'DripNepal',
} as const

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let out = ''
  let value = 0
  let bits = 0
  for (const byte of bytes) {
    // At most 12 bits are pending here, so 16 bits hold them.
    value = ((value << 8) | byte) & 0xffff
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

// Spaces, hyphens and padding are ignored and case does not matter; any other character throws.
export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '')
  const out: number[] = []
  let value = 0
  let bits = 0
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error('not a base32 string')
    value = ((value << 5) | index) & 0xffff
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

// A new secret in base32 (32 characters for 20 bytes).
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(TOTP.secretBytes))
}

// RFC 4226 §5.3: the 6-digit code of `counter`.
export function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', key).update(message).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]
  return String(binary % 10 ** TOTP.digits).padStart(TOTP.digits, '0')
}

// The RFC 6238 time step of a moment, in epoch milliseconds.
export const totpStep = (nowMs: number) => Math.floor(nowMs / 1000 / TOTP.periodSeconds)

// The code of a base32 secret at a moment (tests and the dev tools only need it).
export const totpCode = (secret: string, nowMs = Date.now()) =>
  hotp(base32Decode(secret), totpStep(nowMs))

/*
 * The time step `code` matches, or null. Only the current step and one
 * either side count (07 §3.9), and only a step later than `lastUsedStep`
 * (`users.mfa_last_used_step`): a code already accepted, or an older one,
 * is refused, so an intercepted code cannot be replayed within its window
 * (AC-FR-IAM-007-3). Every candidate is compared in constant time.
 */
export function matchTotp(
  secret: string,
  code: string,
  options: { lastUsedStep: number | null; nowMs?: number }
): number | null {
  if (!new RegExp(`^\\d{${TOTP.digits}}$`).test(code)) return null
  const key = base32Decode(secret)
  const current = totpStep(options.nowMs ?? Date.now())
  const submitted = Buffer.from(code)
  let matched: number | null = null
  for (let step = current - TOTP.window; step <= current + TOTP.window; step++) {
    const same = timingSafeEqual(Buffer.from(hotp(key, step)), submitted)
    const fresh = options.lastUsedStep === null || step > options.lastUsedStep
    if (same && fresh) matched = step
  }
  return matched
}

/*
 * The key URI authenticator apps read (`otpauth://totp/…`): the issuer and
 * the account's email as the label, the secret, and the parameters spelled
 * out. Returned once by `startTotpEnrollment` (docs/06 §13.3).
 */
export function otpauthUri(options: { issuer: string; account: string; secret: string }) {
  // Percent-encoding throughout (RFC 3986), never `+` for a space, which some apps keep.
  const issuer = encodeURIComponent(options.issuer)
  const label = `${issuer}:${encodeURIComponent(options.account)}`
  const query = [
    `secret=${options.secret}`,
    `issuer=${issuer}`,
    'algorithm=SHA1',
    `digits=${TOTP.digits}`,
    `period=${TOTP.periodSeconds}`,
  ].join('&')
  return `otpauth://totp/${label}?${query}`
}

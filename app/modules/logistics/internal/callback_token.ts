import { createHmac, timingSafeEqual } from 'node:crypto'
import { courierConfig } from '#config/logistics'

/*
 * The courier callback URL token of docs/04a §9.14: `HMAC-SHA256(courier
 * callback key, account id)` in base64url. No column holds it: it is derived
 * from the key ring, so a leaked URL is revoked by rotating the key. The
 * active key makes new URLs; every key of the ring still verifies, so a URL
 * keeps working through a rotation until its key leaves the ring.
 */
function tokenWith(key: Buffer, accountId: string) {
  return createHmac('sha256', key).update(accountId, 'utf8').digest('base64url')
}

// Null when no key ring is configured (development without callbacks).
export function callbackTokenFor(accountId: string): string | null {
  const ring = courierConfig.callbackKeys?.release()
  const keyId = courierConfig.callbackActiveKeyId
  const key = ring && keyId ? ring.get(keyId) : undefined
  return key ? tokenWith(key, accountId) : null
}

// Constant time against every key of the ring.
export function callbackTokenMatches(accountId: string, token: string | null | undefined) {
  const ring = courierConfig.callbackKeys?.release()
  if (!ring || typeof token !== 'string' || token.length === 0 || token.length > 128) return false
  const given = Buffer.from(token, 'utf8')
  let matched = false
  for (const key of ring.values()) {
    const expected = Buffer.from(tokenWith(key, accountId), 'utf8')
    if (expected.length === given.length && timingSafeEqual(expected, given)) matched = true
  }
  return matched
}

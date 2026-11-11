import { createHmac } from 'node:crypto'

/*
 * A keyed HMAC-SHA256 (docs/07 §5.5). Each use has its own key from
 * config/crypto.ts: `HMAC_KEY_AUDIT_IP` for `audit_logs.ip_hash` and the
 * access line's `ip_hash`, `HMAC_KEY_TELEMETRY` for the tracker's user
 * reference. Unkeyed hashing of an IP or an ID would be pointless: every
 * IPv4 address can be hashed in minutes.
 */
export function keyedHash(key: Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

/*
 * The keyed hash of a client IP, the same for the access line and
 * `audit_logs.ip_hash`. An IPv4 address mapped into IPv6 (`::ffff:1.2.3.4`)
 * hashes as plain IPv4, so one client has one hash.
 */
export function ipHash(key: Buffer, ip: string): Buffer {
  return keyedHash(key, ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, ''))
}

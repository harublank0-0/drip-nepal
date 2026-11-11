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

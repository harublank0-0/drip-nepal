import { blindIndexKey } from '#config/crypto'
import { keyedHash } from '#modules/platform/crypto/keyed_hash'

/*
 * Blind indexes of docs/04 §2.9: the keyed hash that lets SQL find an
 * encrypted value by equality without decrypting a row. The key is
 * `BLIND_INDEX_KEY`, kept apart from the encryption keys, and each kind of
 * value has its own prefix, so a phone and another value never share a
 * hash.
 */

// `HMAC-SHA256(BLIND_INDEX_KEY, 'phone:' || e164)`, 32 bytes (`*_phone_hash` columns).
export function phoneBlindIndex(e164: string): Buffer {
  return keyedHash(blindIndexKey.release(), `phone:${e164}`)
}

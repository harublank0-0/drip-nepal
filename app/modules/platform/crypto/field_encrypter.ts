import { createCipheriv, randomBytes } from 'node:crypto'
import { fieldEncryption } from '#config/crypto'

/*
 * Field encryption of docs/04 §2.9: AES-256-GCM with a random 12-byte IV per
 * value, stored as `v1.<key_id>.<iv>.<ciphertext>.<tag>` (base64url). The
 * additional authenticated data is `<table>.<column>` (for a JSON snapshot
 * member, `<table>.<column>.<member>`), so a value copied into another column
 * fails to decrypt. New values use the active key of `DATA_ENCRYPTION_KEYS`.
 * Decryption is the separate `field_decrypter.ts`, which only the importers
 * of the docs/07 §5.5 allowlist may use (T-SEC-034).
 */

export const FIELD_FORMAT_VERSION = 'v1'

export function encryptField(plaintext: string, aad: string): string {
  const keyId = fieldEncryption.activeKeyId
  const key = fieldEncryption.keys.release().get(keyId)
  if (!key) throw new Error(`DATA_ENCRYPTION_KEYS has no key "${keyId}"`)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    FIELD_FORMAT_VERSION,
    keyId,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    tag.toString('base64url'),
  ].join('.')
}

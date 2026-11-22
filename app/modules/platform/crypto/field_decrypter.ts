import { createDecipheriv } from 'node:crypto'
import { fieldEncryption } from '#config/crypto'
import { InvariantViolation } from '#exceptions/programming_errors'

/*
 * The decryption half of docs/04 §2.9. Only the importers of the docs/07
 * §5.5 allowlist may import this file; dependency-cruiser enforces the list
 * (rule `field-decrypter-allowlist`, T-SEC-034). A value that does not
 * decrypt (wrong column, unknown key, tampering) is a bug or a data fault,
 * never user input, so it throws `InvariantViolation` without echoing it.
 */
export function decryptField(value: string, aad: string): string {
  const parts = value.split('.')
  if (parts.length !== 5 || parts[0] !== 'v1') {
    throw new InvariantViolation(`field ${aad} is not in the v1 format`)
  }
  const [, keyId, iv, ciphertext, tag] = parts
  const key = fieldEncryption.keys.release().get(keyId)
  if (!key) throw new InvariantViolation(`field ${aad} uses an unknown key id`)
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new InvariantViolation(`field ${aad} does not decrypt`)
  }
}

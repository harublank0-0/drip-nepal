import { randomBytes } from 'node:crypto'

/*
 * A value in the ciphertext format of docs/04 §2.9
 * (`v1.<key_id>.<iv>.<ciphertext>.<tag>`, the `*_enc_check` CHECKs, INV-25)
 * that decrypts under no key: its key ID, `factory`, is in no key ring.
 *
 * docs/04 §20.3 has factories encrypt through the production `fieldCrypto`
 * service with a test key. That service and its key ring
 * (`DATA_ENCRYPTION_KEYS`) are built by epic E6 (docs/12 §4.1) and do not
 * exist yet, so factories fill the NOT NULL encrypted columns with this
 * placeholder and leave the nullable ones null. Replace each call with
 * `fieldCrypto.encrypt(...)` when E6 lands. Test and factory code only.
 *
 * E6 has landed (`encryptField`, app/modules/platform/crypto/field_encrypter.ts),
 * and the shop factory now encrypts its grievance phone (R1-S part 1b, whose
 * settings page decrypts it for the owner). The one caller left is the demo
 * seeder's placeholder TOTP secret, which must stay undecryptable (docs/07
 * §3.9, the TOTP enrolment stand-in).
 */
export function placeholderCiphertext() {
  const part = (bytes: number) => randomBytes(bytes).toString('base64url')
  return `v1.factory.${part(12)}.${part(24)}.${part(16)}`
}

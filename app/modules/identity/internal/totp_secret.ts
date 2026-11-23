import { decryptField } from '#modules/platform/crypto/field_decrypter'
import { encryptField } from '#modules/platform/crypto/field_encrypter'
import { matchTotp } from '#modules/identity/domain/totp'

/*
 * The TOTP verifier of the docs/07 §5.5 decryption allowlist: the one file
 * of the identity module that may decrypt `users.mfa_totp_secret_enc`
 * (dependency-cruiser rule `field-decrypter-allowlist`, T-SEC-034). The
 * secret is sealed with the field encryption of docs/04 §2.9, its AAD the
 * column, and never leaves the server after `startTotpEnrollment` showed it
 * once (07 §3.9).
 *
 * A stored value that does not decrypt (a lost key, the development
 * seeder's placeholder enrolment, docs/07 §3.13) throws the decrypter's
 * `InvariantViolation`: a data fault, answered 500 and reported, never
 * counted as a wrong code (`throttledTotpCheck` gives its limiter points
 * back).
 */
const AAD = 'users.mfa_totp_secret_enc'

export const sealTotpSecret = (secret: string) => encryptField(secret, AAD)

// The step a code matches against the stored secret, or null (domain/totp.ts `matchTotp`).
export function checkTotpCode(
  secretEnc: string,
  code: string,
  lastUsedStep: number | null
): number | null {
  return matchTotp(decryptField(secretEnc, AAD), code, { lastUsedStep })
}

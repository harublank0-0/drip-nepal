import { phoneBlindIndex } from '#modules/platform/crypto/blind_index'
import { encryptField } from '#modules/platform/crypto/field_encrypter'

/*
 * The three `users` phone columns of docs/04 §2.9, written together or not
 * at all (`users_phone_parts_check`): the E.164 number encrypted for
 * `users.phone_enc`, its blind index and its last four digits. Null clears
 * all three. `signUp` and `updateMe` share it, so the account's phone is
 * sealed the same way whichever operation writes it (T-IAM-103).
 */
export type EncryptedPhone = { enc: string | null; hash: Buffer | null; last4: string | null }

export function encryptedPhone(e164: string | null): EncryptedPhone {
  if (!e164) return { enc: null, hash: null, last4: null }
  return {
    enc: encryptField(e164, 'users.phone_enc'),
    hash: phoneBlindIndex(e164),
    last4: e164.slice(-4),
  }
}

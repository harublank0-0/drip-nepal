import { decryptField } from '#modules/platform/crypto/field_decrypter'
import type { AddressRow } from '#modules/identity/queries'
import type { PlaceNames } from '#modules/logistics/queries'

/*
 * The caller's own addresses (docs/06 §13.4 `listAddresses`,
 * `createAddress`, `updateAddress`; the `/account/addresses` props, docs/08
 * §2.4). It is the customer address transformer of the docs/07 §5.5
 * decryption allowlist (T-SEC-034): it decrypts the recipient name, the
 * area and the landmark of the user's own address book, which the user
 * reads and edits. The phone is the last four digits only, in lists and
 * after a write alike (01 AC-FR-IAM-012-5, 06 §13.4): the edit form keeps
 * the saved number unless a new one is typed, as the profile form does with
 * the account phone (docs/08 §2.4). Each member is listed, so no other
 * column can follow into a response: never the ciphertext, `user_id` or
 * `archived_at`.
 *
 * The place names come from the reference data (`placeNames`), the saved
 * code standing in for a name the data does not have.
 */
const aad = (column: string) => `user_addresses.${column}`

export function addressJson(row: AddressRow, names: PlaceNames | undefined) {
  return {
    id: row.id,
    label: row.label,
    recipient_name: decryptField(row.recipient_name_enc, aad('recipient_name_enc')),
    recipient_phone_last4: row.recipient_phone_last4,
    province_code: row.province_code,
    province_name: names?.province ?? row.province_code,
    district_code: row.district_code,
    district_name: names?.district ?? row.district_code,
    local_level_code: row.local_level_code,
    local_level_name: names?.localLevel ?? row.local_level_code,
    ward_no: row.ward_no,
    area_tole: decryptField(row.area_tole_enc, aad('area_tole_enc')),
    street_landmark: row.street_landmark_enc
      ? decryptField(row.street_landmark_enc, aad('street_landmark_enc'))
      : null,
    postal_code: row.postal_code,
    is_default: row.is_default,
  }
}

export type AddressJson = ReturnType<typeof addressJson>

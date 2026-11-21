import { decryptField } from '#modules/platform/crypto/field_decrypter'
import type { PickupAddressRow } from '#modules/shops/actions/pickup_addresses'

/*
 * A shop's pickup addresses for its own members (docs/06 §13.8
 * `getLogisticsSettings`: "with the contact phone in full, as the shop's own
 * data"). This transformer is on the docs/07 §5.5 decryption allowlist for
 * `shop_addresses` (T-SEC-034); no other renders these values.
 */
const aad = (column: string) => `shop_addresses.${column}`

export function pickupAddressJson(row: PickupAddressRow) {
  return {
    id: row.id,
    label: row.label,
    contact_name: row.contact_name,
    contact_phone: decryptField(row.contact_phone_enc, aad('contact_phone_enc')),
    province_code: row.province_code,
    district_code: row.district_code,
    local_level_code: row.local_level_code,
    ward_no: row.ward_no,
    area_tole: decryptField(row.area_tole_enc, aad('area_tole_enc')),
    street_landmark: row.street_landmark_enc
      ? decryptField(row.street_landmark_enc, aad('street_landmark_enc'))
      : null,
    postal_code: row.postal_code,
    is_default: row.is_default,
  }
}

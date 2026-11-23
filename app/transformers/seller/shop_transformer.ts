import { decryptField } from '#modules/platform/crypto/field_decrypter'
import type { SellerActor, SellerShopRow } from '#modules/shops/queries'

/*
 * The shop profile for its own members, as `getSellerShop` answers it
 * (docs/06 §13.5): the profile, the status and `suspension_mode`, whether
 * the shop has accepted the current seller agreement version (04a §6.4),
 * and `version`, which the ETag repeats. The business identity
 * (registration number, authority, PAN/VAT number) and the grievance
 * contact are the owner's only (01 AC-FR-SHOP-013-4): for every other
 * member both are `null`. This transformer is the "shop profile
 * transformer" of the docs/07 §5.5 decryption allowlist: it decrypts the
 * grievance phone for the owner, and nothing for anyone else (T-SEC-034).
 */
export function sellerShopJson(row: SellerShopRow, actor: SellerActor) {
  const owner = actor === 'owner'
  return {
    slug: row.slug,
    name: row.name,
    status: row.status,
    suspension_mode: row.suspension_mode,
    description: row.description,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone_e164,
    return_policy_text: row.return_policy_text,
    business_type: row.business_type,
    is_vat_registered: row.is_vat_registered,
    business_identity: owner
      ? {
          registration_number: row.business_registration_number,
          registration_authority: row.business_registration_authority,
          pan_vat_number: row.pan_vat_number,
        }
      : null,
    grievance_contact:
      owner && row.grievance_contact_name !== null && row.grievance_contact_phone_enc !== null
        ? {
            name: row.grievance_contact_name,
            phone: decryptField(
              row.grievance_contact_phone_enc,
              'shops.grievance_contact_phone_enc'
            ),
          }
        : null,
    agreement: {
      version: row.agreement_version,
      is_final: row.agreement_is_final,
      accepted: row.agreement_accepted,
    },
    version: row.version,
  }
}

import vine from '@vinejs/vine'
import { BUSINESS_TYPES } from '#modules/shops/domain/business_type'
import { SHOP_LIMITS } from '#shared/constants/limits'
import { accountEmail } from '#validators/support/account_email'
import { nepalShopPhone } from '#validators/support/nepal_mobile'
import { blankToNull, clearableNfcText, nfcText } from '#validators/support/nfc_text'

/*
 * `updateShopProfile` (docs/06 §13.5; 01 AC-FR-SHOP-003-1, AC-FR-SHOP-013-2;
 * R1-S part 1b). The members are the whole input, each optional and named
 * as `getSellerShop` names them, flat: anything else (`name`, `slug`,
 * `status`, `commission_rate_bp`, `version`, `shop_id`, an encrypted column,
 * the logo and banner until FR-MED-003, the addresses and the categories)
 * is refused with `unknown_field` before this runs (`assertKnownMembers`,
 * T-SEC-003). The rules are those of `platform:create-shop`, the CHECKs of
 * docs/04a §6.1:
 * - `description`: trimmed, NFC, up to 2,000 code points, or null, which
 *   clears it; the JSON body parser reads `""` as null, and a value of
 *   spaces clears it too (`clearableNfcText`, 06 §3.5).
 * - `contact_email`: the account email rule, lower-cased
 *   (`shops_contact_email_check`).
 * - `contact_phone`, `grievance_contact_phone`: a Nepali mobile or landline,
 *   handed on in E.164 (`nepalShopPhone`, AC-FR-SHOP-001-3).
 * - `return_policy_text`: 1 to 5,000 code points; `grievance_contact_name`
 *   2 to 100.
 * - `business_type`: `individual` or `registered_business`.
 * - `registration_number` (1 to 50), `registration_authority` (2 to 100):
 *   or null; `pan_vat_number`: 9 digits while the IRD format is unconfirmed
 *   (VX-05), or null. A value of spaces clears each of the three, as `""`
 *   does. Whether the result needs them is the action's check, on the saved
 *   values with the changes laid over them.
 * - `is_vat_registered`: a strict boolean.
 *
 * The members of `NOT_NULL_MEMBERS` may be left out but never sent as null
 * or `""`: VineJS's `optional()` reads null as missing (vine 4.4), so the
 * controller refuses them first with `assertNotNull`, 422 `required`.
 */
export const SHOP_PROFILE_MEMBERS = [
  'description',
  'contact_email',
  'contact_phone',
  'return_policy_text',
  'business_type',
  'registration_number',
  'registration_authority',
  'pan_vat_number',
  'is_vat_registered',
  'grievance_contact_name',
  'grievance_contact_phone',
] as const

/*
 * The members only the owner may send (decision of 2026-11-23, R1-S part
 * 1b; docs/06 §13.5, 07 §4.3): the business details of 01 AC-FR-SHOP-013-2,
 * which AC-FR-SHOP-013-4 shows to the owner alone, the return policy among
 * them, and the grievance contact. A member with `shop.profile.manage` who
 * is not the owner gets 403 `FORBIDDEN` for any of them.
 */
export const OWNER_ONLY_PROFILE_MEMBERS = [
  'return_policy_text',
  'business_type',
  'registration_number',
  'registration_authority',
  'pan_vat_number',
  'is_vat_registered',
  'grievance_contact_name',
  'grievance_contact_phone',
] as const

export const NOT_NULL_MEMBERS = [
  'contact_email',
  'contact_phone',
  'return_policy_text',
  'business_type',
  'is_vat_registered',
  'grievance_contact_name',
  'grievance_contact_phone',
] as const

// The PAN/VAT pattern, after a blank has become null (the built-in `regex` would test `null`).
const panVatPattern = vine.createRule((value, _options, field) => {
  if (typeof value === 'string' && !SHOP_LIMITS.panVat.pattern.test(value)) {
    field.report('The {{ field }} field format is invalid', 'regex', field)
  }
})

export const updateShopProfileValidator = vine.create({
  description: clearableNfcText({ min: 1, max: SHOP_LIMITS.description.max }).nullable().optional(),
  contact_email: accountEmail().optional(),
  contact_phone: nepalShopPhone().optional(),
  return_policy_text: nfcText(SHOP_LIMITS.returnPolicyText).optional(),
  business_type: vine.enum(BUSINESS_TYPES).optional(),
  registration_number: clearableNfcText(SHOP_LIMITS.registrationNumber).nullable().optional(),
  registration_authority: clearableNfcText(SHOP_LIMITS.registrationAuthority).nullable().optional(),
  pan_vat_number: vine
    .string()
    .trim()
    .use(blankToNull())
    .use(panVatPattern())
    .nullable()
    .optional(),
  is_vat_registered: vine.boolean({ strict: true }).optional(),
  grievance_contact_name: nfcText(SHOP_LIMITS.grievanceContactName).optional(),
  grievance_contact_phone: nepalShopPhone().optional(),
})

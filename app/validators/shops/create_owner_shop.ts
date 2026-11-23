import vine from '@vinejs/vine'
import { BUSINESS_TYPES } from '#modules/shops/domain/business_type'
import { RESERVED_SHOP_SLUGS, SHOP_SLUG_PATTERN } from '#modules/shops/domain/shop_slug'
import { SHOP_LIMITS } from '#shared/constants/limits'
import { accountEmail } from '#validators/support/account_email'
import { nepalShopPhone } from '#validators/support/nepal_mobile'
import { nfcText } from '#validators/support/nfc_text'

/*
 * The input of `node ace platform:create-shop` (docs/09 §9.8), the columns
 * of docs/04a §6.1 the shop needs when it is inserted, with the rules of its
 * CHECKs: the slug lower-cased, 3–40 characters of `shops_slug_check` and
 * not a reserved word (04 §2.8); the name 2–60 and the grievance name
 * 2–100 code points after NFC; the shop's contact email by the account
 * email rule (lower-cased, `shops_contact_email_check`); the contact and
 * grievance numbers a Nepali mobile or landline in E.164
 * (`shops_contact_phone_check`); the return policy 1–5,000 code points.
 * A `registered_business` needs its registration number, authority and
 * PAN/VAT number (`shops_registered_business_check`); a VAT-registered
 * shop needs its PAN/VAT number (`shops_vat_requires_pan_check`), which
 * the validator takes as 9 digits (04a §6.1, VX-05).
 */
const reservedSlug = vine.createRule((value, _options, field) => {
  if (typeof value === 'string' && RESERVED_SHOP_SLUGS.includes(value)) {
    field.report('The {{ field }} field is a reserved word', 'reservedSlug', field)
  }
})

const vatNeedsPan = vine.createRule((value, _options, field) => {
  if (value === true && !field.parent.pan_vat_number) {
    field.report('A VAT-registered shop needs its PAN/VAT number', 'panRequired', field)
  }
})

const shopSlug = () =>
  vine
    .string()
    .trim()
    .toLowerCase()
    .minLength(SHOP_LIMITS.slug.min)
    .maxLength(SHOP_LIMITS.slug.max)
    .regex(SHOP_SLUG_PATTERN)
    .use(reservedSlug())

export const createOwnerShopValidator = vine.create({
  owner_email: accountEmail(),
  slug: shopSlug(),
  name: nfcText(SHOP_LIMITS.name),
  contact_email: accountEmail(),
  contact_phone: nepalShopPhone(),
  business_type: vine.enum(BUSINESS_TYPES),
  business_registration_number: nfcText(SHOP_LIMITS.registrationNumber)
    .optional()
    .requiredWhen('business_type', '=', 'registered_business'),
  business_registration_authority: nfcText(SHOP_LIMITS.registrationAuthority)
    .optional()
    .requiredWhen('business_type', '=', 'registered_business'),
  pan_vat_number: vine
    .string()
    .trim()
    .regex(SHOP_LIMITS.panVat.pattern)
    .optional()
    .requiredWhen('business_type', '=', 'registered_business'),
  is_vat_registered: vine.boolean({ strict: true }).use(vatNeedsPan()),
  grievance_contact_name: nfcText(SHOP_LIMITS.grievanceContactName),
  grievance_contact_phone: nepalShopPhone(),
  return_policy_text: nfcText(SHOP_LIMITS.returnPolicyText),
})

// The owner's email and the slug, checked before the command asks anything else.
export const ownerAndSlugValidator = vine.create({ owner_email: accountEmail(), slug: shopSlug() })

import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'
import { toNepalMobileE164, toNepalShopPhoneE164 } from '#shared/format/phone'

/*
 * A Nepali mobile number field (docs/04 §2.8, docs/06 §3.5; 01
 * AC-FR-IAM-001-5): accepted with or without `+977`, `977` or a leading
 * `0` and with spaces or hyphens, checked with the rule `NepalPhoneInput`
 * shares (`shared/format/phone.ts`), and handed on in E.164. Anything else,
 * a landline included, answers 422 on the field with the item code
 * `nepal_mobile`. `signUp` and `updateMe` use it; the address book joins
 * with its operations (M1 part 6b).
 */
const nepalMobileRule = vine.createRule((value, _options, field) => {
  if (typeof value !== 'string') return
  const e164 = toNepalMobileE164(value)
  if (!e164) {
    field.report('The {{ field }} field must be a Nepali mobile number', 'nepalMobile', field)
    return
  }
  field.mutate(e164, field)
})

export const nepalMobile = () =>
  vine.string().trim().maxLength(ACCOUNT_LIMITS.phoneInput.max).use(nepalMobileRule())

/*
 * A shop contact number (docs/04 §2.8, 01 AC-FR-SHOP-001-3): a Nepali
 * mobile or an eight-digit landline, with the same prefixes and
 * separators, handed on in E.164 (`toNepalShopPhoneE164`). Anything else
 * answers 422 on the field with the item code `nepal_phone`.
 * `platform:create-shop` and `updateShopProfile` (R1-S part 1b) use it for
 * the shop's contact and grievance numbers.
 */
const nepalShopPhoneRule = vine.createRule((value, _options, field) => {
  if (typeof value !== 'string') return
  const e164 = toNepalShopPhoneE164(value)
  if (!e164) {
    field.report('The {{ field }} field must be a Nepali phone number', 'nepalPhone', field)
    return
  }
  field.mutate(e164, field)
})

export const nepalShopPhone = () =>
  vine.string().trim().maxLength(ACCOUNT_LIMITS.phoneInput.max).use(nepalShopPhoneRule())

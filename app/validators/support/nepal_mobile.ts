import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'
import { toNepalMobileE164 } from '#shared/format/phone'

/*
 * A Nepali mobile number field (docs/04 §2.8, docs/06 §3.5; 01
 * AC-FR-IAM-001-5): accepted with or without `+977`, `977` or a leading
 * `0` and with spaces or hyphens, checked with the rule `NepalPhoneInput`
 * shares (`shared/format/phone.ts`), and handed on in E.164. Anything else,
 * a landline included, answers 422 on the field with the item code
 * `nepal_mobile`. `signUp` uses it today; `updateMe` and the address book
 * join with their operations.
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

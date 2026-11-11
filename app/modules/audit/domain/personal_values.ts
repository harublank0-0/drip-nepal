/*
 * The "no personal values" rule of `audit_logs` (docs/04a §15.3): `changes`
 * never holds a personal value, and a personal column is recorded by name
 * only, as `{"changed": ["grievance_contact_name"]}`. People are referenced
 * by id. This is what lets audit rows outlive anonymisation (docs/04
 * §19.2, §19.3). T-SEC-102 runs the guard with fixture personal values.
 */

/*
 * Column and member names whose values are personal or secret (the
 * Personal, Sensitive-personal and Secret columns of 04a, and the names,
 * emails, phones and addresses held in columns of other classes). Any name
 * ending in `_enc` counts too: only those classes are encrypted (docs/07
 * §5.5). A Public value, such as the shop's own contact (`contact_email`,
 * `contact_phone_e164`), may be recorded as it is.
 */
export const PERSONAL_FIELDS: ReadonlySet<string> = new Set([
  'email',
  'full_name',
  'name_on_account',
  'phone',
  'phone_e164',
  'phone_last4',
  'password',
  'password_hash',
  'security_stamp',
  'token',
  'token_hash',
  'guest_token_hash',
  'totp_secret',
  'contact_name',
  'grievance_contact_name',
  'grievance_contact_phone',
  'account_name',
  'account_number',
  'account_number_last4',
  'recipient_name',
  'recipient_phone',
  'recipient_phone_last4',
  'recipient_details',
  'customer_email_snapshot',
  'shipping_address',
  'street_landmark',
  'address',
  'pan_vat_number',
  'customer_note',
  'note',
  'body',
])

// An email address anywhere in a string.
const EMAIL = /[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[a-z]{2,}/gi

// A Nepali mobile number, with or without the country code (docs/04 §2.8).
const PHONE = /(?<!\d)(?:\+?977[\s-]?)?9[678]\d{8}(?!\d)/g

export function isPersonalField(name: string) {
  return PERSONAL_FIELDS.has(name) || name.endsWith('_enc')
}

export function looksPersonal(text: string) {
  EMAIL.lastIndex = 0
  PHONE.lastIndex = 0
  return EMAIL.test(text) || PHONE.test(text)
}

/*
 * The first rule a `changes` object breaks, as a path, or null. A personal
 * member name breaks it whatever its value (record the name in `changed`
 * instead), and so does any string that holds an email address or a phone
 * number, under whatever name.
 */
export function personalValueIn(value: unknown, path = 'changes'): string | null {
  if (typeof value === 'string') return looksPersonal(value) ? path : null
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = personalValueIn(item, `${path}[${index}]`)
      if (found) return found
    }
    return null
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (isPersonalField(key)) return `${path}.${key}`
      const found = personalValueIn(item, `${path}.${key}`)
      if (found) return found
    }
  }
  return null
}

/*
 * A free-text reason is typed by a person and may quote a customer's
 * contact details; they are masked rather than refused, so a valid action
 * is never rolled back for its wording.
 */
export function maskPersonalText(text: string) {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]')
}

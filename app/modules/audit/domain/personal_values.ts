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

/*
 * An email address anywhere in a string. Every part is bounded (a local
 * part has at most 64 characters, RFC 5321), so a long string without one
 * is scanned in linear time; a string without `@` is not scanned at all.
 */
const EMAIL = /[^\s@<>()[\]",;:]{1,64}@[^\s@<>()[\]",;:]{1,253}\.[a-z]{2,24}/gi

/*
 * A Nepali mobile number (docs/04 §2.8): 9 then 6, 7 or 8, then eight digits,
 * optionally after `977`, `+977` or `00977`, with spaces, dots or hyphens
 * between the digits and in ASCII or Devanagari digits. It must stand alone
 * (no letter or digit on either side), so the digits inside a UUID or a hex
 * hash do not match. Landline numbers are not detected.
 */
const DIGIT = '[0-9\u0966-\u096F]'
const SEP = '[\\s.\\-]?'
const PHONE_SOURCE =
  `(?<![\\p{L}\\p{N}_])(?:(?:\\+|00)?(?:977|\u096F\u096D\u096D)${SEP})?` +
  `[9\u096F]${SEP}[678\u096C-\u096E](?:${SEP}${DIGIT}){8}(?![\\p{L}\\p{N}_])`
const PHONE = new RegExp(PHONE_SOURCE, 'gu')

// `contactName` and `contact_name` are one column: Lucid's dirty keys are camelCase.
export function snakeCase(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

export function isPersonalField(name: string) {
  const column = snakeCase(name)
  return PERSONAL_FIELDS.has(column) || column.endsWith('_enc')
}

export function hasEmail(text: string) {
  if (!text.includes('@')) return false
  EMAIL.lastIndex = 0
  return EMAIL.test(text)
}

export function hasPhone(text: string) {
  PHONE.lastIndex = 0
  return PHONE.test(text)
}

export function looksPersonal(text: string) {
  return hasEmail(text) || hasPhone(text)
}

// Money is integer paisa in `*_minor` members (ADR-0007), never a phone number.
const isMoney = (key: string) => snakeCase(key).endsWith('_minor')

/*
 * The first rule a `changes` object breaks, as a path, or null. A personal
 * member name breaks it whatever its value (record the name in `changed`
 * instead), and so does any string or number that holds an email address
 * or a phone number, under whatever name, money members aside.
 */
export function personalValueIn(value: unknown, path = 'changes', key = ''): string | null {
  if (typeof value === 'string') return looksPersonal(value) ? path : null
  if (typeof value === 'number' || typeof value === 'bigint') {
    return !isMoney(key) && hasPhone(String(value)) ? path : null
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = personalValueIn(item, `${path}[${index}]`, key)
      if (found) return found
    }
    return null
  }
  if (value !== null && typeof value === 'object') {
    for (const [member, item] of Object.entries(value)) {
      if (isPersonalField(member)) return `${path}.${member}`
      const found = personalValueIn(item, `${path}.${member}`, member)
      if (found) return found
    }
  }
  return null
}

/*
 * An identifier column (`subject_id`, `actor_role`) holds an id, a hash or a
 * role, never a raw email or phone number (docs/04a §15.3).
 */
export function isPersonalIdentifier(text: string) {
  return looksPersonal(text)
}

/*
 * A free-text reason is typed by a person and may quote a customer's
 * contact details: emails and mobile numbers are masked rather than
 * refused, so a valid action is never rolled back for its wording. Names
 * cannot be told from other words, so they are not masked; a reason is
 * never filled in from a personal column.
 */
export function maskPersonalText(text: string) {
  const masked = hasEmail(text) ? text.replace(EMAIL, '[email]') : text
  return masked.replace(PHONE, '[phone]')
}

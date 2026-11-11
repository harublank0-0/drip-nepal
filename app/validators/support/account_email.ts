import vine from '@vinejs/vine'

/*
 * The one email rule of every account email (docs/09 §3.6): trimmed and
 * lower-cased before storage (RF-22, `users_email_check`), at most 254
 * characters, and never in the reserved `anonymized.invalid` domain, which
 * only anonymisation placeholders use (docs/04a §5.1
 * `users_anonymized_check`). `signUp`, `platform:create-admin` and any
 * email change use it (T-IAM-112).
 */
export const ANONYMIZED_DOMAIN = 'anonymized.invalid'

const notAnonymizedDomain = vine.createRule((value, _options, field) => {
  if (typeof value !== 'string') return
  if (value.slice(value.lastIndexOf('@') + 1) === ANONYMIZED_DOMAIN) {
    field.report('The {{ field }} field must not use a reserved domain', 'reservedDomain', field)
  }
})

export const accountEmail = () =>
  vine.string().trim().toLowerCase().minLength(3).maxLength(254).email().use(notAnonymizedDomain())

import vine from '@vinejs/vine'
import { ACCOUNT_LIMITS } from '#shared/constants/limits'

/*
 * The one email rule of every account email (docs/09 §3.6): trimmed and
 * lower-cased before storage (RF-22, `users_email_check`), at most 254
 * characters, and never in the reserved top-level domain `.invalid`
 * (RFC 2606), in every environment. That TLD has no mailbox. Only
 * anonymisation placeholders (`deleted-<id>@anonymized.invalid`, docs/04a
 * §5.1 `users_anonymized_check`) and development seed users
 * (`dev.dripnepal.invalid`, docs/09 §8.8) use it, and both are written
 * without this rule. So no live account can hold a placeholder, and the
 * seed-user release check (`T-OPS-023`, docs/09 §9.2) can never be failed
 * by a stranger's signup. `signUp`, `platform:create-admin` and any email
 * change use it (T-IAM-112).
 */
export const RESERVED_TLD = 'invalid'

const notReservedDomain = vine.createRule((value, _options, field) => {
  if (typeof value !== 'string') return
  if (value.slice(value.lastIndexOf('.') + 1) === RESERVED_TLD) {
    field.report('The {{ field }} field must not use a reserved domain', 'reservedDomain', field)
  }
})

export const accountEmail = () =>
  vine
    .string()
    .trim()
    .toLowerCase()
    .minLength(ACCOUNT_LIMITS.email.min)
    .maxLength(ACCOUNT_LIMITS.email.max)
    .email()
    .use(notReservedDomain())

import { DomainError } from '#exceptions/domain_error'

/*
 * docs/06 §5.1: a request member the operation does not take answers 422
 * `VALIDATION_FAILED` with `unknown_field`, never silently dropped, so a
 * client that sends `shop_id`, a price or a status learns it was refused
 * (T-SEC-003). Called before the validator, on the raw body.
 */
export function assertKnownMembers(body: unknown, allowed: readonly string[]) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw new DomainError('VALIDATION_FAILED', {
      detail: 'Some fields need attention.',
      errors: unknown.map((field) => ({
        field,
        code: 'unknown_field',
        message: 'This field is not accepted.',
      })),
    })
  }
}

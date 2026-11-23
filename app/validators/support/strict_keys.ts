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

/*
 * A member that may be left out but, once sent, may not be null: VineJS's
 * `optional()` treats null as missing (vine 4.4.0), and the JSON body parser
 * turns an empty string into null (`convertEmptyStringsToNull`), so without
 * this a blank value would be skipped and answer 200 having changed nothing.
 * Each such member answers 422 `required` on its field (docs/06 §5.2).
 */
export function assertNotNull(body: unknown, members: readonly string[]) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return
  const record = body as Record<string, unknown>
  const blank = members.filter((key) => key in record && record[key] === null)
  if (blank.length > 0) {
    throw new DomainError('VALIDATION_FAILED', {
      detail: 'Some fields need attention.',
      errors: blank.map((field) => ({
        field,
        code: 'required',
        message: 'This field is required.',
      })),
    })
  }
}

/*
 * `assertKnownMembers` for the objects of an array member, such as the
 * rates of `replaceShopShipping`: an unknown member of item `i` answers 422
 * `unknown_field` on `<member>.<i>.<key>`. VineJS drops the unknown
 * properties of a nested object silently, so this runs first (T-SEC-003).
 * A member that is not an array, or an item that is not an object, is left
 * to the validator.
 */
export function assertKnownItemMembers(body: unknown, member: string, allowed: readonly string[]) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return
  const items = (body as Record<string, unknown>)[member]
  if (!Array.isArray(items)) return
  const errors = items.flatMap((item, index) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.keys(item)
          .filter((key) => !allowed.includes(key))
          .map((key) => ({
            field: `${member}.${index}.${key}`,
            code: 'unknown_field',
            message: 'This field is not accepted.',
          }))
      : []
  )
  if (errors.length > 0) {
    throw new DomainError('VALIDATION_FAILED', { detail: 'Some fields need attention.', errors })
  }
}

import vine from '@vinejs/vine'

/*
 * The query of `listAttributes` (docs/06 §13.2): an optional category slug
 * of the shape of `categories_slug_check` (docs/04a §7.1). The controller
 * refuses any other query parameter first, and answers a refusal here with
 * 400 `INVALID_QUERY_PARAMETER`, not 422 (06 §6.3).
 */
export const listAttributesValidator = vine.create({
  category: vine
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/)
    .optional(),
})

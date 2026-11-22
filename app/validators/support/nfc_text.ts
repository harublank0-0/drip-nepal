import vine from '@vinejs/vine'

/*
 * Trimmed NFC text whose length the database checks with `char_length`,
 * such as a person's name (docs/04 §2.8). The order matters: NFC can make
 * a string longer, because the Devanagari nukta letters U+0958–U+095F are
 * composition exclusions and each becomes two code points, so the value is
 * normalised first and its length is counted afterwards, in code points as
 * `char_length` counts them, not in UTF-16 units. Checking the length before
 * normalising would let a name through that the column's CHECK refuses,
 * which answers 500 instead of 422. Too short or too long answers 422 on the
 * field with the item code `min_length` or `max_length`, as Vine's own
 * length rules do. `signUp` uses it for `full_name`; `updateMe` and the
 * other name fields join with their operations.
 */
const toNfc = vine.createRule((value, _options, field) => {
  if (typeof value !== 'string') return
  field.mutate(value.normalize('NFC'), field)
})

type LengthOptions = { min: number; max: number }

const codePointLength = vine.createRule<LengthOptions>((value, options, field) => {
  if (typeof value !== 'string') return
  const length = [...value].length
  if (length < options.min) {
    field.report(
      'The {{ field }} field must have at least {{ min }} characters',
      'minLength',
      field,
      options
    )
  } else if (length > options.max) {
    field.report(
      'The {{ field }} field must not be greater than {{ max }} characters',
      'maxLength',
      field,
      options
    )
  }
})

export const nfcText = (limits: LengthOptions) =>
  vine.string().trim().use(toNfc()).use(codePointLength(limits))

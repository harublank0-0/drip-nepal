import pg from 'pg'

/*
 * PostgreSQL `bigint` (int8) values, which hold money in paisa
 * (docs/04 §18.4), arrive as JavaScript numbers instead of node-postgres's
 * default strings, so `a + b` adds instead of concatenating. A value
 * outside Number.MAX_SAFE_INTEGER can't be a number, so reading it throws.
 * `count(*)` is a bigint too, so counts arrive as numbers.
 */
const INT8_OID = 20

export function parseInt8(text: string): number {
  const value = Number(text)
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`int8 value ${text} is outside Number.MAX_SAFE_INTEGER`)
  }
  return value
}

pg.types.setTypeParser(INT8_OID, parseInt8)

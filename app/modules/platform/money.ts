import db from '@adonisjs/lucid/services/db'
import type { DatabaseQueryBuilderContract } from '@adonisjs/lucid/types/querybuilder'
import type { ModelQueryBuilderContract, LucidModel } from '@adonisjs/lucid/types/model'

/*
 * An amount of money in whole paisa (docs/04 §18.1, ADR-0007): a safe
 * integer, from a `*_minor` bigint column or from these helpers. Rupees
 * typed by people go through `parseRupeesToMinor` (shared/format/money.ts).
 */
export type Minor = number

/*
 * Paisa that don't come through the int8 parser: a safe integer number, a
 * bigint in range, or a string of digits. Anything else throws.
 */
export function toMinor(value: unknown): Minor {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (
    typeof value === 'bigint' &&
    value <= BigInt(Number.MAX_SAFE_INTEGER) &&
    value >= BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return Number(value)
  }
  if (typeof value === 'string' && /^-?\d{1,16}$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  throw new RangeError(`Not an amount in paisa: ${String(value)}`)
}

/*
 * The sum of a money column. PostgreSQL's SUM of a bigint is numeric,
 * which arrives as a string; the cast back to bigint makes the int8 parser
 * read it as a safe number (and PostgreSQL fail if it leaves the range).
 */
export async function sumMinor(
  query: DatabaseQueryBuilderContract | ModelQueryBuilderContract<LucidModel>,
  column: string
): Promise<Minor> {
  const selected = query
    .clearSelect()
    .clearOrder()
    .select(db.raw('COALESCE(SUM(??), 0)::bigint as total_minor', [column]))
  const rows = ('pojo' in selected ? await selected.pojo() : await selected) as {
    total_minor: unknown
  }[]
  return toMinor(rows[0]?.total_minor ?? 0)
}

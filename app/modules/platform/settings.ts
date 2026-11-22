import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/*
 * Reads one `platform_settings` value inside the caller's transaction, as
 * values that move deadlines must be read where they are used and copied onto
 * the row (docs/04a §15.1). Returns `fallback` for a key that is not seeded.
 */
export async function settingIn<T>(
  trx: TransactionClientContract,
  key: string,
  fallback: T
): Promise<T> {
  const row = await trx.from('platform_settings').where('key', key).select('value').first()
  return row ? (row.value as T) : fallback
}

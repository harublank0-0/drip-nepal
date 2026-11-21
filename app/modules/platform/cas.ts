import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { InvariantViolation } from '#exceptions/programming_errors'

/*
 * `casStatus` of docs/09 §3.8 and docs/05 §9.2: the compare-and-set every
 * state transition is. It updates one row only while its status is one of
 * `from`, sets `updated_at`, bumps `version` on a versioned table, and
 * returns whether a row changed. On `false` the caller re-reads and decides
 * between an idempotent no-op and `InvalidStateTransition`. A shop-scoped
 * table needs `shopId` in the key (docs/07 §4.1, T-SEC-001).
 */

const TABLES = {
  shipments: { shopScoped: true, versioned: true },
  shop_orders: { shopScoped: true, versioned: true },
  logistics_accounts: { shopScoped: false, versioned: true },
} as const

export type CasTable = keyof typeof TABLES

export type CasKey<T extends CasTable> = (typeof TABLES)[T]['shopScoped'] extends true
  ? { id: string; shopId: string }
  : { id: string }

// snake_case columns other than the ones the helper owns.
export type CasPatch = Record<string, unknown>

const OWNED = new Set(['status', 'id', 'shop_id', 'version', 'updated_at'])

export async function casStatus<T extends CasTable>(
  trx: TransactionClientContract,
  table: T,
  key: CasKey<T>,
  from: string | readonly string[],
  to: string,
  patch: CasPatch = {}
): Promise<boolean> {
  for (const column of Object.keys(patch)) {
    if (OWNED.has(column)) throw new InvariantViolation(`casStatus patch may not set ${column}`)
  }
  const spec = TABLES[table]
  const values: Record<string, unknown> = { ...patch, status: to, updated_at: trx.raw('now()') }
  if (spec.versioned) values.version = trx.raw('version + 1')
  const query = trx
    .from(table)
    .where('id', key.id)
    .whereIn('status', typeof from === 'string' ? [from] : [...from])
  if (spec.shopScoped) query.where('shop_id', (key as { shopId: string }).shopId)
  const rows = await query.update(values).returning('id')
  return rows.length === 1
}

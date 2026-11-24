import { AsyncLocalStorage } from 'node:async_hooks'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { IsolationLevels, TransactionClientContract } from '@adonisjs/lucid/types/database'
import { NestedTransaction } from '#exceptions/programming_errors'

/*
 * The transaction helpers of docs/09 §3.8, the one place that calls
 * `db.transaction(` (lint). `withTx` sets the lock and statement timeouts of
 * docs/03 §8.2 with `set_config(..., true)`, which is `SET LOCAL` with
 * bindings, and records in an AsyncLocalStorage that a transaction is open,
 * so a port adapter called inside one throws (`PortAdapter.guard`). A
 * deadlock (40P01) is retried once with jitter; the idempotency row of the
 * first attempt rolled back with it, so the retry is safe.
 */

const scope = new AsyncLocalStorage<{ inTx: true }>()

export const insideTransaction = () => scope.getStore()?.inTx === true

export type TxOptions = {
  lockTimeoutMs?: number
  statementTimeoutMs?: number
  // Default: PostgreSQL's READ COMMITTED.
  isolationLevel?: IsolationLevels
}

export async function withTx<T>(
  fn: (trx: TransactionClientContract) => Promise<T>,
  { lockTimeoutMs = 5_000, statementTimeoutMs = 10_000, isolationLevel }: TxOptions = {}
): Promise<T> {
  if (insideTransaction()) throw new NestedTransaction()
  const run = () =>
    db.transaction(
      async (trx) => {
        await trx.rawQuery('select set_config(?, ?, true), set_config(?, ?, true)', [
          'lock_timeout',
          `${lockTimeoutMs}ms`,
          'statement_timeout',
          `${statementTimeoutMs}ms`,
        ])
        return scope.run({ inTx: true }, () => fn(trx))
      },
      // Only with a level: an options object, even an empty one, breaks a nested
      // (savepoint) transaction, which Knex reads as its callback.
      isolationLevel ? { isolationLevel } : undefined
    )
  try {
    return await run()
  } catch (error) {
    if ((error as { code?: string }).code !== '40P01') throw error
    logger.error({ event: 'db.deadlock_retry' }, 'deadlock detected; retrying the transaction once')
    await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150))
    return run()
  }
}

// The worker's values of docs/03 §8.2.
export const jobTx = <T>(fn: (trx: TransactionClientContract) => Promise<T>) =>
  withTx(fn, { lockTimeoutMs: 10_000, statementTimeoutMs: 30_000 })

/*
 * A savepoint inside an open transaction, for one statement whose failure
 * the caller handles and retries (a random key that collided, docs/04 §2.1):
 * the savepoint rolls back alone and the outer transaction survives.
 */
export function withSavepoint<T>(
  trx: TransactionClientContract,
  fn: (savepoint: TransactionClientContract) => Promise<T>
): Promise<T> {
  return trx.transaction(fn)
}

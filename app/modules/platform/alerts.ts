import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/*
 * An admin alert (docs/11 §9.2): one structured log line at `error` with a
 * fixed `alert` name, which the log tool alerts on. Fields are identifiers
 * and codes only, never personal data or secrets (docs/09 §7.2). Decided
 * 2026-11-21 with the M6 courier work, which raises the first ones.
 */
export type AlertFields = Record<string, string | number | boolean | null>

// Inside a transaction, pass it: the alert is written after the commit, never for a rollback or twice
// for a deadlock retry.
export function raiseAlert(
  alert: string,
  fields: AlertFields = {},
  trx?: TransactionClientContract
) {
  const write = () => logger.error({ event: 'alert', alert, ...fields }, alert)
  if (trx) trx.after('commit', write)
  else write()
}

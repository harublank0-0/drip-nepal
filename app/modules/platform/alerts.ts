import logger from '@adonisjs/core/services/logger'

/*
 * An admin alert (docs/11 §9.2): one structured log line at `error` with a
 * fixed `alert` name, which the log tool alerts on. Fields are identifiers
 * and codes only, never personal data or secrets (docs/09 §7.2). Decided
 * 2026-11-21 with the M6 courier work, which raises the first ones.
 */
export type AlertFields = Record<string, string | number | boolean | null>

export function raiseAlert(alert: string, fields: AlertFields = {}) {
  logger.error({ event: 'alert', alert, ...fields }, alert)
}

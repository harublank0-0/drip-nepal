import { Logger } from '@adonisjs/core/logger'

/*
 * Log capture for tests that assert what was logged (an alert, a request ID)
 * or that a value was never logged.
 */

export type LogLine = {
  level: string
  fields: Record<string, unknown>
  message: string
  request_id: unknown
}

// Every line written through an Adonis Logger while `run` runs.
export async function captureLogs(run: () => Promise<void>) {
  const lines: LogLine[] = []
  const original = Logger.prototype.log
  Logger.prototype.log = function (this: Logger, level, fields, message, ...values) {
    lines.push({
      level,
      fields: (fields ?? {}) as Record<string, unknown>,
      message: String(message),
      request_id: (this.bindings() as Record<string, unknown>).request_id,
    })
    return original.call(this, level, fields, message, ...values)
  } as Logger['log']
  try {
    await run()
  } finally {
    Logger.prototype.log = original
  }
  return lines
}

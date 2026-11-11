import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, syncDestination, targets } from '@adonisjs/core/logger'
import { REDACT_CENSOR, REDACT_PATHS } from '#config/log_redaction'
import { runtime } from '#config/runtime'

const loggerConfig = defineConfig({
  /**
   * Default logger name used by ctx.logger and app logger calls.
   */
  default: 'app',

  loggers: {
    app: {
      /**
       * Toggle this logger on/off.
       */
      enabled: true,

      /**
       * Logger name shown in log records.
       */
      name: env.get('APP_NAME'),

      /**
       * Minimum level to output (trace, debug, info, warn, error, fatal).
       */
      level: env.get('LOG_LEVEL'),

      /**
       * Paths whose values never reach a log line (docs/09 §7.2).
       */
      redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },

      /**
       * Every line names its process (`web` for the server, `console` for
       * the worker and `node ace`) and release, replacing pino's `hostname`,
       * which the log shipper adds (docs/09 §7.1).
       */
      base: { pid: process.pid, process: app.getEnvironment(), release: runtime.release },

      /**
       * A synchronous pretty stream on a developer machine only; test,
       * staging and production write raw JSON lines to stdout (docs/09 §7.1).
       */
      destination: app.inDev ? await syncDestination() : undefined,

      /**
       * Configure where logs are written.
       */
      transport: {
        targets: [targets.file({ destination: 1 })],
      },
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}

import emitter from '@adonisjs/core/services/emitter'
import logger from '@adonisjs/core/services/logger'

/*
 * With DB_DEBUG on (development only; start/env_policy.ts refuses it in
 * staging and prod), Lucid emits `db:query` for every query. One `db.query`
 * line carries the SQL, its duration and whether it ran in a transaction,
 * never the bindings, which can hold password hashes and personal data
 * (docs/09 §7.6, RF-26).
 */
emitter.on('db:query', (query) => {
  logger.info(
    {
      connection: query.connection,
      sql: query.sql,
      duration_ms: Array.isArray(query.duration)
        ? Math.round(query.duration[0] * 1000 + query.duration[1] / 1e6)
        : null,
      in_transaction: query.inTransaction ?? false,
    },
    'db.query'
  )
})

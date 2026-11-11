import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'

// Shared by both connections: the migration runner and schema:generate
const migrations = {
  naturalSort: true,
  paths: ['database/migrations'],
  // down() is for development and CI only (docs/09 §8.2, ADR-0011)
  disableRollbacksInProduction: true,
}
/*
 * Reference data first, then development data (docs/09 §8.8): `db:seed`
 * runs the paths in this order and sorts each folder naturally, so the
 * numbered reference files run in dependency order. Helpers live in
 * database/support/, outside both paths, so they are never loaded as seeders.
 */
const seeders = {
  paths: ['./database/seeders/reference', './database/seeders/dev'],
  naturalSort: true,
}
const schemaGeneration = {
  enabled: true,
  outputPath: 'database/schema.ts',
  rulesPaths: ['#database/schema_rules'],
  excludeTables: ['sessions', 'rate_limits'],
}

/*
 * TLS to PostgreSQL (docs/09 §6.3, docs/07 §5.5): the server certificate is
 * verified, against DB_SSL_CA when the provider gives one. Production
 * refuses DB_SSL=false (start/env_policy.ts).
 */
// A PEM put on one line with literal "\n" (as secret stores often hold it) is unfolded.
const ca = env.get('DB_SSL_CA')?.replaceAll('\\n', '\n')
const ssl = env.get('DB_SSL') ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false

// Query logging, without bindings, only when a developer asks for it (docs/09 §7.6).
const debug = env.get('DB_DEBUG') ?? false

/*
 * The web process's page reads run outside transactions, so its connections
 * carry the request limits themselves (docs/09 §6.3, docs/03 §3.4).
 * `node ace` commands and the worker are `console` and are not cut off.
 */
/*
 * The pool limits for `DB_POOL_MAX` (docs/09 §6.3). Tarn's minimum is 2 by
 * default and it refuses a maximum below the minimum, so a one-off
 * container run with `DB_POOL_MAX=1` (docs/11 §10.1, §14.6) would not
 * start. The minimum is therefore never above the maximum.
 */
export function poolLimits(max: number) {
  return { min: Math.min(2, max), max }
}

const requestTimeouts =
  app.getEnvironment() === 'web' ? { statement_timeout: 10_000, lock_timeout: 5_000 } : {}

/*
 * Test roles (docs/09 §6.1, docs/10 §3.2): under NODE_ENV=test the app runs
 * as `dripnepal_app` on `pg`, and migrations run as `dripnepal_migrator` on
 * `pg_migrator`, same host and database, so the grants of docs/07 §4.10 are
 * real in tests. Other environments have no second connection: the release
 * step injects the migrator's values into the DB_* names instead.
 */
const migratorConnection = (): Record<string, PostgreConfig> => {
  const user = env.get('DB_MIGRATOR_USER')
  const password = env.get('DB_MIGRATOR_PASSWORD')
  if (env.get('NODE_ENV') !== 'test' || !user || !password) return {}
  return {
    pg_migrator: {
      client: 'pg',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user,
        password: password.release(),
        database: env.get('DB_DATABASE'),
        ssl,
      },
      migrations,
      seeders,
      schemaGeneration,
      debug,
    },
  }
}

const dbConfig = defineConfig({
  /**
   * Default connection used for all queries.
   */
  connection: 'pg',
  // Bindings are never printed: start/events.ts logs the SQL alone (docs/09 §7.6).
  prettyPrintDebugQueries: false,
  connections: {
    /**
     * PostgreSQL connection.
     * Install package to switch: npm install pg
     */
    pg: {
      client: 'pg',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD').release(),
        database: env.get('DB_DATABASE'),
        ssl,
        ...requestTimeouts,
      },
      pool: poolLimits(env.get('DB_POOL_MAX')),
      migrations,
      seeders,
      schemaGeneration,
      debug,
    },

    ...migratorConnection(),
  },
})

export default dbConfig

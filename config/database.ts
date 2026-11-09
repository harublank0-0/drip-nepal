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
      },
      migrations,
      seeders,
      schemaGeneration,
      debug: app.inDev,
    },
  }
}

const dbConfig = defineConfig({
  /**
   * Default connection used for all queries.
   */
  connection: 'pg',
  prettyPrintDebugQueries: true,
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
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
      },
      migrations,
      seeders,
      schemaGeneration,
      debug: app.inDev,
    },

    ...migratorConnection(),

    /**
     * MySQL / MariaDB connection.
     * Install package to switch: npm install mysql2
     */
    // mysql: {
    //   client: 'mysql2',
    //   connection: {
    //     host: env.get('DB_HOST'),
    //     port: env.get('DB_PORT'),
    //     user: env.get('DB_USER'),
    //     password: env.get('DB_PASSWORD'),
    //     database: env.get('DB_DATABASE'),
    //   },
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },

    /**
     * Microsoft SQL Server connection.
     * Install package to switch: npm install tedious
     */
    // mssql: {
    //   client: 'mssql',
    //   connection: {
    //     server: env.get('DB_HOST'),
    //     port: env.get('DB_PORT'),
    //     user: env.get('DB_USER'),
    //     password: env.get('DB_PASSWORD'),
    //     database: env.get('DB_DATABASE'),
    //   },
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },

    /**
     * libSQL (Turso) connection.
     * Install package to switch: npm install @libsql/client
     */
    // libsql: {
    //   client: 'libsql',
    //   connection: {
    //     url: env.get('LIBSQL_URL'),
    //     authToken: env.get('LIBSQL_AUTH_TOKEN'),
    //   },
    //   useNullAsDefault: true,
    //   migrations: {
    //     naturalSort: true,
    //     paths: ['database/migrations'],
    //   },
    //   debug: app.inDev,
    // },
  },
})

export default dbConfig

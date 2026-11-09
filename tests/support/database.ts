import { readdir } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'

async function runAce(command: string, args: string[]) {
  const ace = await app.container.make('ace')
  const result = await ace.exec(command, args)
  if (result.exitCode) {
    throw result.error ?? new Error(`"node ace ${command}" failed`)
  }
}

// The migrator's connection (config/database.ts, docs/09 §6.1 "Test roles")
export const MIGRATOR_CONNECTION = 'pg_migrator'

// The reference seeders (docs/09 §8.8), in the order db:seed runs them.
export const REFERENCE_SEEDERS_PATH = 'database/seeders/reference'

/*
 * The reference seeder files as `--files` flags, the way the release step
 * passes them (docs/10 §3.2, docs/11 §5.4), so a development seeder never
 * runs in tests. Sorted as Lucid's `naturalSort` sorts them.
 */
export async function referenceSeederFlags() {
  const entries = await readdir(app.makePath(REFERENCE_SEEDERS_PATH), { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /\.(ts|js)$/.test(entry.name))
    .map((entry) => entry.name.replace(/\.(ts|js)$/, ''))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((name) => `--files=${REFERENCE_SEEDERS_PATH}/${name}`)
}

// Runs the reference seeders as the migrator; throws when one fails.
export async function runReferenceSeeders() {
  await runAce('db:seed', [
    `--connection=${MIGRATOR_CONNECTION}`,
    '--compact-output',
    ...(await referenceSeederFlags()),
  ])
}

let prepared: Promise<void> | undefined

/*
 * Rebuilds the test database once per run (docs/10 §3.2): drop every table,
 * run the migrations, then the reference seeders, all as
 * `dripnepal_migrator` on the `pg_migrator` connection, so the tables
 * belong to the migrator and the tests, which run as `dripnepal_app` on the
 * default connection, meet the grants of docs/07 §4.10. Tests read the
 * reference rows and never change them (docs/10 §3.4). The locations
 * seeder is not written yet (docs/04 §20.3), so tests that need a district
 * insert it themselves. start/env.ts refuses to boot under NODE_ENV=test
 * unless DB_DATABASE ends in _test (RF-32), so this can only ever wipe a
 * test database.
 *
 * `db:wipe` then `migration:run` is `migration:fresh` with one more flag:
 * Lucid 22.4.2's `migration:fresh` does not pass `--no-schema-generate` on,
 * and the schema classes in database/schema.ts must not be regenerated, so a
 * test run never edits a tracked file.
 */
export function prepareTestDatabase() {
  prepared ??= (async () => {
    await runAce('db:wipe', [`--connection=${MIGRATOR_CONNECTION}`])
    await runAce('migration:run', [
      `--connection=${MIGRATOR_CONNECTION}`,
      '--compact-output',
      '--no-schema-generate',
    ])
    // TODO(T-ARCH-004): the pg-boss schema step and the idempotent `pgboss`
    // grants to dripnepal_app, as the migrator, go here, before the reference
    // seeders (docs/10 §3.2, docs/09 §6.1 "Test roles"). Their command is fixed
    // by the M0 spike T-ARCH-004, which is not done yet.
    await runReferenceSeeders()
  })()
  return prepared
}

import app from '@adonisjs/core/services/app'

/*
 * Reference data every environment has, seeded the way DEPLOY.md seeds
 * production. Tests create everything else they need (docs/10 §3.4).
 */
const REFERENCE_SEEDERS = [
  'database/seeders/category_seeder.ts',
  'database/seeders/shop_category_seeder.ts',
  'database/seeders/attribute_seeder.ts',
  'database/seeders/global_role_seeder.ts',
]

async function runAce(command: string, args: string[]) {
  const ace = await app.container.make('ace')
  const result = await ace.exec(command, args)
  if (result.exitCode) {
    throw result.error ?? new Error(`"node ace ${command}" failed`)
  }
}

let prepared: Promise<void> | undefined

/*
 * Rebuilds the test database once per run: drop every table, run the
 * migrations, seed the reference data (docs/10 §3.2). start/env.ts refuses
 * to boot under NODE_ENV=test unless DB_DATABASE ends in _test (RF-32), so
 * this can only ever wipe a test database.
 *
 * The schema classes in database/schema.ts are not regenerated, so a test
 * run never edits a tracked file.
 */
export function prepareTestDatabase() {
  prepared ??= (async () => {
    await runAce('db:wipe', [])
    await runAce('migration:run', ['--compact-output', '--no-schema-generate'])
    await runAce(
      'db:seed',
      REFERENCE_SEEDERS.map((file) => `--files=${file}`)
    )
  })()
  return prepared
}

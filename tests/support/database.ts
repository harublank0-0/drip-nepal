import app from '@adonisjs/core/services/app'

async function runAce(command: string, args: string[]) {
  const ace = await app.container.make('ace')
  const result = await ace.exec(command, args)
  if (result.exitCode) {
    throw result.error ?? new Error(`"node ace ${command}" failed`)
  }
}

let prepared: Promise<void> | undefined

/*
 * Rebuilds the test database once per run: drop every table and run the
 * migrations (docs/10 §3.2). The E4 reference seeders are not written yet
 * (docs/12 §4.1), so tests create every row they need. start/env.ts refuses
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
  })()
  return prepared
}

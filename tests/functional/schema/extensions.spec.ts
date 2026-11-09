import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

/*
 * T-ARCH-034 on the migrated database (ADR-0016 decision 2, docs/11 §1.9):
 * the extensions in `pg_extension` after the migrations are those of the
 * allow-list, checked by the same script as the migration files, so an
 * extension created in any other way fails too.
 */

const run = promisify(execFile)
const SCRIPT = join(process.cwd(), 'scripts', 'check_migration_extensions.mjs')

test.group('T-ARCH-034 extension allow-list', () => {
  test('T-ARCH-034 the migrated database has only allow-listed extensions', async ({ assert }) => {
    const { rows } = await db.rawQuery('SELECT extname FROM pg_extension ORDER BY extname')
    const installed = (rows as { extname: string }[]).map((row) => row.extname)
    assert.includeMembers(installed, ['citext', 'pg_trgm'])
    const result = await run('node', [SCRIPT, '--installed', installed.join(',')]).then(
      ({ stdout }) => ({ code: 0, stdout, stderr: '' }),
      (error: { code: number; stdout: string; stderr: string }) => error
    )
    assert.equal(result.code, 0, result.stderr)
  })
})

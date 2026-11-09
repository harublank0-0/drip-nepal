import { test } from '@japa/runner'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

/*
 * T-ARCH-034: the migration lint refuses every PostgreSQL extension outside
 * the allow-list of ADR-0016 decision 2 (`citext`, `pg_trgm`, `pgcrypto`;
 * docs/11 §1.9). The script runs against fixture migrations here and against
 * the repository's migrations in CI; tests/functional/schema/extensions.spec.ts
 * gives it the extensions of the migrated database.
 */

const run = promisify(execFile)
const SCRIPT = join(process.cwd(), 'scripts', 'check_migration_extensions.mjs')

const migration = (sql: string) => `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw\`SET LOCAL lock_timeout = '5s'\`)
    this.schema.raw(String.raw\`${sql}\`)
  }
}
`

async function lint(sql: string, ...flags: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'migration-extensions-'))
  try {
    await mkdir(join(root, 'migrations'))
    await writeFile(join(root, 'migrations', '1794300000000_create_things.ts'), migration(sql))
    const { stdout } = await run('node', [SCRIPT, '--dir', join(root, 'migrations'), ...flags])
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string }
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test.group('T-ARCH-034 extension allow-list', () => {
  test('T-ARCH-034 the repository migrations create only allow-listed extensions', async ({
    assert,
  }) => {
    const { stdout } = await run('node', [SCRIPT])
    assert.match(stdout, /^\d+ CREATE EXTENSION statement\(s\) use the allow-list/)
  })

  test('T-ARCH-034 accepts {sql}')
    .with([
      { sql: 'CREATE EXTENSION IF NOT EXISTS citext' },
      { sql: 'create extension pg_trgm' },
      { sql: 'CREATE EXTENSION IF NOT EXISTS "pgcrypto"' },
    ])
    .run(async ({ assert }, { sql }) => {
      const result = await lint(sql)
      assert.equal(result.code, 0, result.stderr)
    })

  test('T-ARCH-034 refuses {sql}')
    .with([
      { sql: 'CREATE EXTENSION IF NOT EXISTS postgis', extension: 'postgis' },
      { sql: 'create extension "uuid-ossp"', extension: 'uuid-ossp' },
      {
        sql: 'CREATE  EXTENSION\n      IF NOT EXISTS pg_stat_statements',
        extension: 'pg_stat_statements',
      },
    ])
    .run(async ({ assert }, { sql, extension }) => {
      const result = await lint(sql)
      assert.equal(result.code, 1)
      assert.include(
        result.stderr,
        `1794300000000_create_things.ts: extension ${extension} is not in the allow-list`
      )
    })

  test('T-ARCH-034 a database extension outside the allow-list fails', async ({ assert }) => {
    const ok = await lint('CREATE EXTENSION citext', '--installed', 'plpgsql,citext,pg_trgm')
    assert.equal(ok.code, 0, ok.stderr)
    const result = await lint('CREATE EXTENSION citext', '--installed', 'plpgsql,citext,postgis')
    assert.equal(result.code, 1)
    assert.include(result.stderr, 'database: extension postgis is not in the allow-list')
  })
})

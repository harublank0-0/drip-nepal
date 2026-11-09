import { test } from '@japa/runner'
import { execFile } from 'node:child_process'
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

/*
 * T-ARCH-017: the script test of the migration-lock script with fixture
 * migrations (docs/09 §8.4, §8.2; ADR-0011). Without a lock file the script
 * runs in file-name mode, as it does in M0 (docs/12 §4.3 item 2); with one it
 * also compares checksums, as it will from the first production deploy.
 */

const run = promisify(execFile)
const SCRIPT = join(process.cwd(), 'scripts', 'check_migrations_lock.mjs')

const TRANSACTIONAL = `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw\`SET LOCAL lock_timeout = '5s'\`)
    this.schema.raw(String.raw\`CREATE TABLE things (id uuid PRIMARY KEY)\`)
  }
}
`

const CONCURRENT = `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  static disableTransactions = true

  async up() {
    this.schema.raw(String.raw\`DROP INDEX CONCURRENTLY IF EXISTS things_name_idx\`)
    this.schema.raw(String.raw\`CREATE INDEX CONCURRENTLY things_name_idx ON things (name)\`)
  }
}
`

type Result = { code: number; stdout: string; stderr: string }

// A fixture folder of migration files, and the script run against it.
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'migrations-lock-'))
  const dir = join(root, 'migrations')
  const lock = join(root, 'migrations.lock')
  await mkdir(dir)
  for (const [name, source] of Object.entries(files)) await writeFile(join(dir, name), source)
  const check = async (...flags: string[]): Promise<Result> => {
    try {
      const { stdout, stderr } = await run('node', [SCRIPT, '--dir', dir, '--lock', lock, ...flags])
      return { code: 0, stdout, stderr }
    } catch (error) {
      const failed = error as { code: number; stdout: string; stderr: string }
      return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr }
    }
  }
  return { root, dir, lock, check }
}

const BASELINE = {
  '1794026522050_baseline_extensions_and_functions.ts': TRANSACTIONAL,
  '1794026524134_baseline_logistics_reference.ts': TRANSACTIONAL,
}

test.group('T-ARCH-017 migration-lock script, file-name mode', (group) => {
  // Each test starts node one or more times; the unit suite's default is 2 s.
  group.each.timeout(10_000)
  const roots: string[] = []
  group.each.teardown(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  })

  test('T-ARCH-017 the repository migrations pass in file-name mode', async ({ assert }) => {
    const { stdout } = await run('node', [SCRIPT])
    assert.match(stdout, /pass \(file-name mode\)/)
  })

  test('T-ARCH-017 names and first statements of 09 §8.2 pass', async ({ assert }) => {
    const { root, check } = await fixture({
      ...BASELINE,
      '1794300000000_index_things_name.ts': CONCURRENT,
      // Typed signatures, with and without a space before the parameter list
      '1794300000001_add_things_name.ts': TRANSACTIONAL.replace(
        'async up()',
        'async up(): Promise<void>'
      ),
      '1794300000002_add_things_size.ts': TRANSACTIONAL.replace(
        'async up()',
        'async up (): Promise<void>'
      ),
    })
    roots.push(root)
    const result = await check()
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /5 migration file\(s\) pass \(file-name mode\)/)
  })

  test('T-ARCH-017 refuses the file name {name}')
    .with([
      { name: '1794300000000_products.ts' },
      { name: '1794300000000_update_products.ts' },
      { name: '1794300000000_create_Things.ts' },
      { name: '1794300000000_create-things.ts' },
      { name: '179430000000_create_things.ts' },
    ])
    .run(async ({ assert }, { name }) => {
      const { root, check } = await fixture({ ...BASELINE, [name]: TRANSACTIONAL })
      roots.push(root)
      const result = await check()
      assert.equal(result.code, 1)
      assert.include(result.stderr, `${name}: file name does not follow 09 §8.2`)
    })

  test('T-ARCH-017 refuses a file whose first statement is not the lock timeout', async ({
    assert,
  }) => {
    const { root, check } = await fixture({
      ...BASELINE,
      '1794300000000_alter_things.ts': TRANSACTIONAL.replace(
        "SET LOCAL lock_timeout = '5s'",
        "SET LOCAL lock_timeout = '50s'"
      ),
      '1794300000001_alter_others.ts': TRANSACTIONAL.replace(
        /\s+this\.schema\.raw\(String\.raw`SET LOCAL[^\n]+/,
        ''
      ),
    })
    roots.push(root)
    const result = await check()
    assert.equal(result.code, 1)
    assert.include(result.stderr, '1794300000000_alter_things.ts: the first statement must be')
    assert.include(result.stderr, '1794300000001_alter_others.ts: the first statement must be')
  })

  test('T-ARCH-017 a disableTransactions file starts with DROP INDEX CONCURRENTLY', async ({
    assert,
  }) => {
    const { root, check } = await fixture({
      ...BASELINE,
      '1794300000000_index_things_name.ts': CONCURRENT.replace(
        /\s+this\.schema\.raw\(String\.raw`DROP INDEX[^\n]+/,
        ''
      ),
    })
    roots.push(root)
    const result = await check()
    assert.equal(result.code, 1)
    assert.include(
      result.stderr,
      '1794300000000_index_things_name.ts: a disableTransactions file starts with DROP INDEX CONCURRENTLY IF EXISTS'
    )
  })
})

test.group('T-ARCH-017 migration-lock script, checksum mode', (group) => {
  group.each.timeout(10_000)
  const roots: string[] = []
  group.each.teardown(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  })

  // A fixture whose files are all locked by --write.
  async function lockedFixture() {
    const locked = await fixture(BASELINE)
    roots.push(locked.root)
    const written = await locked.check('--write')
    if (written.code !== 0) throw new Error(written.stderr)
    return locked
  }

  test('T-ARCH-017 --write locks every file with its sha256, in order', async ({ assert }) => {
    const { lock, check } = await lockedFixture()
    const text = await readFile(lock, 'utf8')
    const lines = text.trim().split('\n')
    assert.lengthOf(lines, 2)
    assert.match(lines[0], /^[0-9a-f]{64} {2}1794026522050_baseline_extensions_and_functions\.ts$/)
    assert.match(lines[1], /^[0-9a-f]{64} {2}1794026524134_baseline_logistics_reference\.ts$/)
    const result = await check()
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /pass \(checksum mode\)/)
  })

  test('T-ARCH-017 an applied migration edited, even by whitespace, fails', async ({ assert }) => {
    const { dir, check } = await lockedFixture()
    await appendFile(join(dir, '1794026524134_baseline_logistics_reference.ts'), '\n')
    const result = await check()
    assert.equal(result.code, 1)
    assert.include(
      result.stderr,
      '1794026524134_baseline_logistics_reference.ts: applied migration changed; write a new migration instead'
    )
  })

  test('T-ARCH-017 an applied migration renamed or deleted fails', async ({ assert }) => {
    const { dir, check } = await lockedFixture()
    await rename(
      join(dir, '1794026522050_baseline_extensions_and_functions.ts'),
      join(dir, '1794026522050_baseline_extensions.ts')
    )
    await unlink(join(dir, '1794026524134_baseline_logistics_reference.ts'))
    const result = await check()
    assert.equal(result.code, 1)
    assert.include(
      result.stderr,
      '1794026522050_baseline_extensions_and_functions.ts: locked migration deleted or renamed'
    )
    assert.include(
      result.stderr,
      '1794026524134_baseline_logistics_reference.ts: locked migration deleted or renamed'
    )
  })

  test('T-ARCH-017 a new file needs its lock line, which --write appends', async ({ assert }) => {
    const { dir, lock, check } = await lockedFixture()
    await writeFile(join(dir, '1794300000000_add_things_name.ts'), TRANSACTIONAL)
    const result = await check()
    assert.equal(result.code, 1)
    assert.include(result.stderr, '1794300000000_add_things_name.ts: add its line to')

    const written = await check('--write')
    assert.equal(written.code, 0, written.stderr)
    const text = await readFile(lock, 'utf8')
    assert.lengthOf(text.trim().split('\n'), 3)
    const again = await check()
    assert.equal(again.code, 0, again.stderr)
  })

  test('T-ARCH-017 a new file older than the newest locked one fails', async ({ assert }) => {
    const { dir, check } = await lockedFixture()
    await writeFile(join(dir, '1794026523000_add_things_name.ts'), TRANSACTIONAL)
    const result = await check('--write')
    assert.equal(result.code, 1)
    assert.include(
      result.stderr,
      '1794026523000_add_things_name.ts: older than 1794026524134_baseline_logistics_reference.ts; regenerate after rebasing'
    )
  })
})

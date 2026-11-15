import { test } from '@japa/runner'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * T-ARCH-001, the "writes only by the owning module" check (docs/09 §2.4):
 * a raw SQL INSERT, UPDATE or DELETE in app/ sits in the module that owns
 * the table in architecture/model-ownership.json.
 */

const OWNERSHIP = JSON.stringify({
  tables: {
    users: { module: 'identity', model: 'app/models/user.ts' },
    shops: { module: 'shops', model: 'app/models/shop.ts' },
  },
})

async function check(path: string, source: string) {
  const tree = await fixtureTree({ 'architecture/model-ownership.json': OWNERSHIP, [path]: source })
  try {
    return await runScript('check_owner_writes.mjs', ['--root', tree.root])
  } finally {
    await tree.cleanup()
  }
}

test.group('T-ARCH-001 raw SQL writes only in the owning module', () => {
  test('T-ARCH-001 the repository passes', async ({ assert }) => {
    const result = await runScript('check_owner_writes.mjs')
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-ARCH-001 passes: {case}')
    .with([
      {
        case: 'the owner writes its table',
        source: "await trx.rawQuery('UPDATE users SET name = ? WHERE id = ?', [a, b])",
      },
      {
        case: 'a read of another table, an upsert and a row lock',
        source:
          'await trx.rawQuery(`SELECT * FROM shops FOR UPDATE`)\nawait trx.rawQuery(`INSERT INTO users (id) VALUES (?) ON CONFLICT (id) DO UPDATE SET id = excluded.id`, [a])',
      },
      {
        case: 'SQL in a comment and lower-case prose',
        source:
          "// DELETE FROM shops is the shops module's job\nconst message = 'cannot update shops'",
      },
      {
        case: 'another schema',
        source: "await trx.rawQuery('DELETE FROM pgboss.job WHERE id = ?', [a])",
      },
    ])
    .run(async ({ assert }, { source }) => {
      const result = await check('app/modules/identity/actions/thing.ts', `${source}\n`)
      assert.equal(result.code, 0, result.stderr)
    })

  test('T-ARCH-001 fails on {case}')
    .with([
      {
        case: "a write to another module's table",
        path: 'app/modules/identity/actions/thing.ts',
        source: "await trx.rawQuery('DELETE FROM shops WHERE id = ?', [a])",
        expected: 'DELETE FROM shops: shops belongs to shops',
      },
      {
        case: 'a write outside app/modules/',
        path: 'app/controllers/thing.ts',
        source: 'await db.rawQuery(`INSERT INTO "public"."users" (id) VALUES (?)`, [a])',
        expected: 'INSERT INTO users: users belongs to identity',
      },
      {
        case: 'a table missing from the map',
        path: 'app/modules/identity/actions/thing.ts',
        source: "await trx.rawQuery('UPDATE widgets SET x = 1')",
        expected: 'UPDATE widgets: the table is not in architecture/model-ownership.json',
      },
    ])
    .run(async ({ assert }, { path, source, expected }) => {
      const result = await check(path, `const a = 1\n${source}\n`)
      assert.equal(result.code, 1)
      assert.include(result.stderr, `${path}:2: ${expected}`)
    })
})

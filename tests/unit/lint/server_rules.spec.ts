import { test } from '@japa/runner'
import { lintMessages } from '#tests/support/lint'

/*
 * T-ARCH-021: the server rules of eslint.config.js (docs/09 §11.2, §11.3,
 * docs/07 §7.4), each with a failing and a passing fixture linted at a path
 * it would have. T-SEC-016's lint half, the fetch and WebSocket globals
 * outside providers/ (docs/09 §2.4 rule 8), is here too.
 */

const SYNTAX = ['no-restricted-syntax']

test.group('T-ARCH-021 server lint rules', (group) => {
  group.each.timeout(30_000)

  test('T-ARCH-021 {rule} fails in app/')
    .with([
      { rule: 'mass assignment by spread argument', code: 'User.create(...rows)' },
      { rule: 'mass assignment by object spread', code: 'User.create({ ...payload, role: 1 })' },
      { rule: 'mass assignment by merge spread', code: 'user.merge({ ...body })' },
      { rule: 'mass assignment of a payload', code: 'user.fill(payload)' },
      { rule: 'a template literal in SQL', code: 'trx.rawQuery(`SELECT ${column} FROM users`)' },
      {
        rule: 'String.raw with an expression in SQL',
        code: 'trx.rawQuery(String.raw`DELETE FROM ${t}`)',
      },
      { rule: 'concatenated SQL', code: "query.whereRaw('name = ' + name)" },
      { rule: 'db.transaction', code: 'db.transaction(async (trx) => trx)' },
      { rule: 'fetch (T-SEC-016)', code: "fetch('https://example.com')" },
      { rule: 'globalThis.fetch (T-SEC-016)', code: "globalThis.fetch('https://example.com')" },
      { rule: 'WebSocket (T-SEC-016)', code: "new WebSocket('wss://example.com')" },
    ])
    .run(async ({ assert }, { code }) => {
      const messages = await lintMessages(
        `export function f(a: any) {\n  return ${code}\n}\n`.replace(
          'a: any',
          '...args: unknown[]'
        ),
        'app/modules/catalog/actions/thing.ts',
        SYNTAX
      )
      assert.deepEqual(messages, ['2:no-restricted-syntax'])
    })

  test('T-ARCH-021 the allowed forms pass in app/')
    .with([
      { code: 'User.create({ email: input.email, name: input.name })' },
      { code: "trx.rawQuery('SELECT * FROM users WHERE id = ?', [id])" },
      { code: 'trx.rawQuery(String.raw`SELECT 1`)' },
      { code: 'trx.rawQuery(`SELECT 1\n  FROM users`)' },
      { code: 'withTx(async (trx) => trx)' },
    ])
    .run(async ({ assert }, { code }) => {
      const messages = await lintMessages(
        `export function f() {\n  return ${code}\n}\n`,
        'app/modules/catalog/actions/thing.ts',
        SYNTAX
      )
      assert.deepEqual(messages, [])
    })

  test('T-SEC-016 fetch and WebSocket pass inside a providers/ adapter', async ({ assert }) => {
    const code = "export const f = () => [fetch('https://x.test'), new WebSocket('wss://x.test')]\n"
    assert.deepEqual(await lintMessages(code, 'app/modules/logistics/providers/ncm.ts', SYNTAX), [])
  })

  test('T-ARCH-021 db.transaction passes in app/modules/platform/tx.ts only', async ({
    assert,
  }) => {
    const code = 'export const tx = () => db.transaction(async (trx) => trx)\n'
    assert.deepEqual(await lintMessages(code, 'app/modules/platform/tx.ts', SYNTAX), [])
  })

  test('T-ARCH-021 controllers may not serialize a model, and keep the app/ rules', async ({
    assert,
  }) => {
    const code =
      'export const show = (user: any) => [user.serialize(), user.toJSON(), fetch("/x")]\n'
    const messages = await lintMessages(
      code,
      'app/controllers/seller/products_controller.ts',
      SYNTAX
    )
    assert.deepEqual(messages, [
      '1:no-restricted-syntax',
      '1:no-restricted-syntax',
      '1:no-restricted-syntax',
    ])
  })

  test('T-ARCH-021 app/ may not import factories or #start/env', async ({ assert }) => {
    const code =
      "import { UserFactory } from '#database/factories/user_factory'\nimport env from '#start/env'\nexport const x = [UserFactory, env]\n"
    const messages = await lintMessages(code, 'app/modules/identity/actions/thing.ts', [
      'no-restricted-imports',
    ])
    assert.deepEqual(messages, ['1:no-restricted-imports', '2:no-restricted-imports'])
  })

  test('T-ARCH-021 @ts-ignore and any fail in {filePath}; @ts-expect-error with a reason passes')
    .with([
      { filePath: 'app/modules/identity/actions/thing.ts' },
      { filePath: 'inertia/pages/home.tsx' },
    ])
    .run(async ({ assert }, { filePath }) => {
      const code =
        'export function f(value: any) {\n  // @ts-ignore\n  value.x = 1\n  // @ts-expect-error -- the fixture assigns to a number\n  ;(1 as number).y = 2\n}\n'
      const messages = await lintMessages(code, filePath, [
        '@typescript-eslint/no-explicit-any',
        '@typescript-eslint/ban-ts-comment',
      ])
      assert.deepEqual(messages, [
        '1:@typescript-eslint/no-explicit-any',
        '2:@typescript-eslint/ban-ts-comment',
      ])
    })
})

import { test } from '@japa/runner'
import { lintMessages } from '#tests/support/lint'

/*
 * T-ARCH-021: the server rules of eslint.config.js (docs/09 §11.2, §11.3,
 * docs/07 §7.4), each with a failing and a passing fixture linted at a path
 * it would have. T-SEC-016's lint half, the fetch and WebSocket globals
 * outside providers/ (docs/09 §2.4 rule 8), is here too.
 */

const SYNTAX = ['no-restricted-syntax']
const OUTBOUND = ['no-restricted-globals', 'no-restricted-properties']

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

  test('T-SEC-016 {case} fails in {filePath}')
    .with(
      [
        { case: 'a fetch call', code: "fetch('https://x.test')" },
        { case: 'a reference to fetch', code: 'const send = fetch' },
        { case: 'globalThis.fetch', code: "globalThis.fetch('https://x.test')" },
        { case: 'global.fetch', code: "global.fetch('https://x.test')" },
        { case: 'new WebSocket', code: "new WebSocket('wss://x.test')" },
        { case: 'globalThis.WebSocket', code: 'const Socket = globalThis.WebSocket' },
      ].flatMap((entry) =>
        [
          'app/modules/catalog/actions/thing.ts',
          'app/controllers/seller/products_controller.ts',
          'start/routes.ts',
          'start/env.ts',
          'config/mail.ts',
          'commands/thing.ts',
          'providers/api_provider.ts',
          'database/seeders/dev/thing.ts',
        ].map((filePath) => ({ ...entry, filePath }))
      )
    )
    .run(async ({ assert }, { code, filePath }) => {
      const messages = await lintMessages(
        `export function f() {\n  ${code}\n}\n`,
        filePath,
        OUTBOUND
      )
      assert.lengthOf(messages, 1)
      assert.match(messages[0], /^2:no-restricted-(globals|properties)$/)
    })

  test('T-SEC-016 fetch and WebSocket pass inside a providers/ adapter', async ({ assert }) => {
    const code =
      "export const f = () => [fetch('https://x.test'), globalThis.fetch, new WebSocket('wss://x.test')]\n"
    assert.deepEqual(
      await lintMessages(code, 'app/modules/logistics/providers/ncm.ts', OUTBOUND),
      []
    )
  })

  test('T-SEC-016 a local function named fetch is not the global', async ({ assert }) => {
    const code = 'const fetch = (id: string) => id\nexport const f = () => fetch("a")\n'
    assert.deepEqual(await lintMessages(code, 'app/modules/catalog/queries.ts', OUTBOUND), [])
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
      'export const show = (user: any) => [user.serialize(), user.toJSON(), db.transaction(() => 1)]\n'
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
      "import { UserFactory } from '#database/factories/user_factory'\nimport env from '#start/env'\nimport { ShopFactory } from '../../../../database/factories/shop_factory.js'\nexport const x = [UserFactory, env, ShopFactory]\n"
    const messages = await lintMessages(code, 'app/modules/identity/actions/thing.ts', [
      'no-restricted-imports',
    ])
    assert.deepEqual(messages, [
      '1:no-restricted-imports',
      '2:no-restricted-imports',
      '3:no-restricted-imports',
    ])
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

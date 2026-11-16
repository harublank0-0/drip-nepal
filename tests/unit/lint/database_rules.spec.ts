import { test } from '@japa/runner'
import { lintMessages } from '#tests/support/lint'

/*
 * T-ARCH-021: the database/ rules of eslint.config.js (docs/09 §8.6, §9.2)
 * and the migration import ban of ADR-0011 decision 3 (docs/10 §6.2 row:
 * "includes the migration import ban").
 */

const MIGRATION = 'database/migrations/1794300000000_create_things.ts'

const migration = (statement: string) => `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    ${statement}
  }
}
`

test.group('T-ARCH-021 database lint rules', (group) => {
  group.each.timeout(30_000)

  test('T-ARCH-021 a migration statement fails: {case}')
    .with([
      { case: 'a plain string', statement: "this.schema.raw('CREATE TABLE things ()')" },
      { case: 'a template literal', statement: 'this.schema.raw(`CREATE TABLE things ()`)' },
      {
        case: 'String.raw with an expression',
        statement: 'this.schema.raw(String.raw`DROP TABLE ${name}`)',
      },
    ])
    .run(async ({ assert }, { statement }) => {
      const messages = await lintMessages(migration(statement), MIGRATION, ['no-restricted-syntax'])
      assert.isAbove(messages.length, 0)
      assert.isTrue(messages.every((message) => message === '5:no-restricted-syntax'))
    })

  test('T-ARCH-021 String.raw with literals only passes', async ({ assert }) => {
    const code = migration("this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)")
    assert.deepEqual(await lintMessages(code, MIGRATION, ['no-restricted-syntax']), [])
  })

  test('T-ARCH-021 a migration may not import {specifier}')
    .with([
      { specifier: '#constants/shop_status' },
      { specifier: '#models/shop' },
      { specifier: '#modules/catalog/domain/product_status' },
      { specifier: '#start/env' },
    ])
    .run(async ({ assert }, { specifier }) => {
      const code = `import thing from '${specifier}'\n${migration('this.schema.raw(String.raw`SELECT 1`)')}\nexport const t = thing\n`
      assert.deepEqual(await lintMessages(code, MIGRATION, ['no-restricted-imports']), [
        '1:no-restricted-imports',
      ])
    })

  test('T-ARCH-021 a literal password fails in a seeder or factory: {filePath}')
    .with([
      { filePath: 'database/seeders/dev/users_seeder.ts' },
      { filePath: 'database/factories/user_factory.ts' },
    ])
    .run(async ({ assert }, { filePath }) => {
      const code =
        "export const user = { email: 'a@b.test', password: 'secret123' }\nexport const ok = { password: randomPassword() }\ndeclare function randomPassword(): string\n"
      assert.deepEqual(await lintMessages(code, filePath, ['no-restricted-syntax']), [
        '1:no-restricted-syntax',
      ])
    })
})

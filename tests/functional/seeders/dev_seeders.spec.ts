import { readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { DevSeeder, RefusedInThisEnvironment, devSeederRefusal } from '#database/support/dev_seeder'

/*
 * The development-seeder guards of docs/09 §8.8 (RF-05, ADR-0011):
 * T-ARCH-019, development seeders refuse production or a database without
 * `_dev`/`_test`; T-ARCH-020, every development seeder extends `DevSeeder`
 * and keeps its run(). A refusal throws, so Lucid marks the seeder `failed`
 * and db:seed exits 1.
 */

class ProbeSeeder extends DevSeeder {
  seeded = false
  protected async seed() {
    this.seeded = true
  }
}

// A client that reports `name` as the connected database, and nothing else.
function clientOn(name: string) {
  return {
    rawQuery: async () => ({ rows: [{ name }] }),
  } as unknown as QueryClientContract
}

test.group('T-ARCH-019 development seeders refuse production', () => {
  test('T-ARCH-019 Lucid skips a development seeder under NODE_ENV=production', ({ assert }) => {
    // Lucid runs a seeder only when `static environment` includes the Node
    // environment (guard 1); a subclass inherits the list.
    assert.deepEqual(ProbeSeeder.environment, ['development', 'test'])
    assert.notInclude(ProbeSeeder.environment, 'production')
  })

  test('T-ARCH-019 run() refuses when the app runs in production', ({ assert }) => {
    // Guard 2: app.inProduction is fixed for this process, so the rule is
    // tested on the function run() calls.
    assert.isString(devSeederRefusal({ inProduction: true, databaseName: 'dripnepal_test' }))
    assert.isNull(devSeederRefusal({ inProduction: false, databaseName: 'dripnepal_test' }))
  })

  test('T-ARCH-019 run() refuses a database whose name lacks _dev or _test: {name}')
    .with([{ name: 'dripnepal' }, { name: 'dripnepal_staging' }, { name: 'dripnepal_test_old' }])
    .run(async ({ assert }, { name }) => {
      const seeder = new ProbeSeeder(clientOn(name))
      await assert.rejects(() => seeder.run(), RefusedInThisEnvironment)
      assert.isFalse(seeder.seeded)
    })

  test('T-ARCH-019 run() seeds on a _dev or _test database', async ({ assert }) => {
    for (const name of ['dripnepal_dev', 'dripnepal_test']) {
      const seeder = new ProbeSeeder(clientOn(name))
      await seeder.run()
      assert.isTrue(seeder.seeded, name)
    }
    // And on the real test database, through the real query.
    const seeder = new ProbeSeeder(db.connection())
    await seeder.run()
    assert.isTrue(seeder.seeded)
  })
})

test.group('T-ARCH-020 development seeders extend DevSeeder', () => {
  test('T-ARCH-020 every class in database/seeders/dev/ extends DevSeeder and keeps its run()', async ({
    assert,
  }) => {
    const directory = app.makePath('database/seeders/dev')
    const files = await readdir(directory, { recursive: true }).catch((error) => {
      if (error.code === 'ENOENT') return [] // no development seeder yet (docs/04 §20.3)
      throw error
    })
    for (const file of files.filter((name) => /\.(ts|js)$/.test(name))) {
      const module = await import(pathToFileURL(`${directory}/${file}`).href)
      const seeder = module.default
      assert.isTrue(
        typeof seeder === 'function' && seeder.prototype instanceof DevSeeder,
        `${file} must extend DevSeeder (database/support/dev_seeder.ts)`
      )
      assert.strictEqual(
        seeder.prototype.run,
        DevSeeder.prototype.run,
        `${file} must not override run(); implement seed() instead`
      )
    }
  })
})

import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { REFERENCE_SEEDERS_PATH } from '#tests/support/database'
import { DevSeeder, RefusedInThisEnvironment, devSeederRefusal } from '#database/support/dev_seeder'

/*
 * The development-seeder guards of docs/09 §8.8 (RF-05, ADR-0011):
 * T-ARCH-019, development seeders refuse production, `APP_ENV` staging or
 * production, or a database without `_dev`/`_test`; T-ARCH-020, every
 * development seeder extends `DevSeeder` and keeps its run(). A refusal throws, so Lucid marks the seeder `failed`
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
    // Guard 2: app.inProduction and APP_ENV are fixed for this process, so
    // the rule is tested on the function run() calls.
    const on = { inProduction: false, appEnv: 'test', databaseName: 'dripnepal_test' }
    assert.isString(devSeederRefusal({ ...on, inProduction: true }))
    assert.isNull(devSeederRefusal(on))
    assert.isNull(devSeederRefusal({ ...on, appEnv: 'development', databaseName: 'dripnepal_dev' }))
  })

  test('T-ARCH-019 run() refuses APP_ENV={appEnv} whatever NODE_ENV says')
    .with([{ appEnv: 'staging' }, { appEnv: 'production' }])
    .run(({ assert }, { appEnv }) => {
      // A deployed host whose NODE_ENV is not production, on a _test database.
      const refusal = devSeederRefusal({
        inProduction: false,
        appEnv,
        databaseName: 'dripnepal_test',
      })
      assert.equal(refusal, `development seeders refuse APP_ENV=${appEnv}`)
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

// Script files under `directory`, relative to it; none when it does not exist.
async function scriptFiles(directory: string) {
  const files = await readdir(directory, { recursive: true }).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  return files.filter((name) => /\.(ts|js)$/.test(name) && !name.endsWith('.d.ts'))
}

test.group('T-ARCH-020 development seeders extend DevSeeder', () => {
  test('T-ARCH-020 every class in the development seeder paths extends DevSeeder and keeps its run()', async ({
    assert,
  }) => {
    // The seeder paths db:seed scans, from config/database.ts (docs/09 §8.8):
    // every one except the reference path holds development seeders.
    const config = db.getRawConnection(db.primaryConnectionName)!.config
    const paths = (config.seeders?.paths ?? []).map((path) =>
      relative(app.makePath(), app.makePath(path))
    )
    assert.include(paths, REFERENCE_SEEDERS_PATH, 'the reference seeder path is configured')
    const devPaths = paths.filter((path) => path !== REFERENCE_SEEDERS_PATH)
    assert.isNotEmpty(devPaths, 'a development seeder path is configured')

    // No seeder file may sit outside the configured paths, where this test
    // would not see it.
    for (const file of await scriptFiles(app.makePath('database/seeders'))) {
      const path = join('database/seeders', file)
      assert.isTrue(
        paths.some((configured) => path.startsWith(`${configured}/`)),
        `${path} is outside the configured seeder paths`
      )
    }

    for (const devPath of devPaths) {
      const directory = app.makePath(devPath)
      // No development seeder exists yet (docs/04 §20.3), so this may find none.
      for (const file of await scriptFiles(directory)) {
        const module = await import(pathToFileURL(join(directory, file)).href)
        const seeder = module.default
        assert.isTrue(
          typeof seeder === 'function' && seeder.prototype instanceof DevSeeder,
          `${devPath}/${file} must extend DevSeeder (database/support/dev_seeder.ts)`
        )
        assert.strictEqual(
          seeder.prototype.run,
          DevSeeder.prototype.run,
          `${devPath}/${file} must not override run(); implement seed() instead`
        )
      }
    }
  })
})

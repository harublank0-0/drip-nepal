import { BaseSeeder } from '@adonisjs/lucid/seeders'
import app from '@adonisjs/core/services/app'
import { runtime } from '#config/runtime'

/*
 * The base class of every development seeder in database/seeders/dev/
 * (docs/09 §8.8, RF-05, ADR-0011 decision 4). It lives outside the seeder
 * paths, so db:seed never loads it as a seeder. Three independent guards:
 *
 * 1. `static environment`: Lucid marks the seeder `ignored` under
 *    NODE_ENV=production and never calls run().
 * 2. run() refuses when `app.inProduction`, or when `APP_ENV` is `staging`
 *    or `production` (start/env.ts, docs/09 §6.1), so a staging host whose
 *    NODE_ENV was mistyped is still refused.
 * 3. run() refuses unless `current_database()` ends in `_dev` or `_test`,
 *    whatever the environment variables say.
 *
 * A refusal throws, Lucid marks the seeder `failed` and db:seed exits 1.
 * Subclasses implement seed() and never override run() (T-ARCH-020).
 */

export class RefusedInThisEnvironment extends Error {}

export type DevSeederSituation = { inProduction: boolean; appEnv: string; databaseName: string }

const DEPLOYED = ['staging', 'production']

/** Why a development seeder must not run here (guards 2 and 3), or null. */
export function devSeederRefusal(situation: DevSeederSituation): string | null {
  if (situation.inProduction) return 'development seeders refuse NODE_ENV=production'
  if (DEPLOYED.includes(situation.appEnv)) {
    return `development seeders refuse APP_ENV=${situation.appEnv}`
  }
  if (!/_(dev|test)$/.test(situation.databaseName)) {
    return `development seeders refuse database ${situation.databaseName}`
  }
  return null
}

export abstract class DevSeeder extends BaseSeeder {
  static environment = ['development', 'test']

  protected abstract seed(): Promise<void>

  async run() {
    const result = await this.client.rawQuery('SELECT current_database() AS name')
    const refusal = devSeederRefusal({
      inProduction: app.inProduction,
      appEnv: runtime.appEnv,
      databaseName: result.rows[0].name,
    })
    if (refusal) throw new RefusedInThisEnvironment(refusal)
    await this.seed()
  }
}

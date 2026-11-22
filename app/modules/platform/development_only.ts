import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { runtime } from '#config/runtime'

/*
 * The check every development-only path runs before it acts: the
 * development seeders (database/support/dev_seeder.ts, docs/09 §8.8) and the
 * development-only sign-in (docs/07 §3.13 guard 2). It refuses when the app
 * runs in production, when `APP_ENV` is `staging` or `production` (a
 * deployed host whose NODE_ENV was mistyped), or when the database actually
 * connected is not a development or test one, whatever the environment
 * variables say.
 */

export type DevelopmentSituation = { inProduction: boolean; appEnv: string; databaseName: string }

const DEPLOYED = ['staging', 'production']

/** Why `subject` must not run here, or null. */
export function developmentOnlyRefusal(
  situation: DevelopmentSituation,
  subject: string
): string | null {
  if (situation.inProduction) return `${subject} refuse NODE_ENV=production`
  if (DEPLOYED.includes(situation.appEnv)) return `${subject} refuse APP_ENV=${situation.appEnv}`
  if (!/_(dev|test)$/.test(situation.databaseName)) {
    return `${subject} refuse database ${situation.databaseName}`
  }
  return null
}

/** The same check for this process and its default connection. */
export async function developmentOnlyRefusalHere(subject: string) {
  const result = await db.rawQuery('SELECT current_database() AS name')
  return developmentOnlyRefusal(
    { inProduction: app.inProduction, appEnv: runtime.appEnv, databaseName: result.rows[0].name },
    subject
  )
}

import db from '@adonisjs/lucid/services/db'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import type { PgBoss } from 'pg-boss'
import {
  createJobBoss,
  hasJobBoss,
  jobDatabaseOf,
  setJobBoss,
  JOB_SCHEMA,
} from '#modules/platform/jobs'

/*
 * A real pg-boss instance for tests that send jobs (docs/10 §3): the web
 * role's, on the test database. In the functional suite a send runs on the
 * test's transaction, so the job is visible to that test and rolled back with
 * it. Handlers are called directly with the queued payload.
 */
let shared: PgBoss | null = null

// Starts the shared instance once and returns it, for a test that fetches or sends itself.
export async function useJobBoss(): Promise<PgBoss> {
  // A test that swapped in a fake and then cleared it (setJobBoss(null)) leaves the shared
  // instance running: register it again rather than start a second one that is never stopped,
  // whose timers would keep the test process alive after the run.
  if (shared) {
    if (!hasJobBoss()) setJobBoss(shared)
    return shared
  }
  const config = db.manager.get(db.primaryConnectionName)?.config as PostgreConfig
  const boss = createJobBoss(jobDatabaseOf(config)!, 'web')
  await boss.start()
  shared = boss
  setJobBoss(boss)
  return boss
}

export async function stopJobBoss() {
  if (!shared) return
  await shared.stop({ graceful: true, close: true })
  setJobBoss(null)
  shared = null
}

// The jobs of `queue` sent since `since` and not yet worked, oldest first.
export async function queued<T = Record<string, unknown>>(queue: string) {
  const rows = await db
    .from(`${JOB_SCHEMA}.job`)
    .where('name', queue)
    .whereIn('state', ['created', 'retry'])
    .orderBy('created_on', 'asc')
    .select('id', 'data')
  return rows.map((row) => ({ id: row.id as string, data: row.data as T }))
}

export const FIRST_TRY = { retryCount: 0, retryLimit: 3, requestId: null }
export const LAST_TRY = { retryCount: 5, retryLimit: 5, requestId: null }

import type { ApplicationService } from '@adonisjs/core/types'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import type { PgBoss } from 'pg-boss'
import { createJobBoss, hasJobBoss, jobDatabaseOf, setJobBoss } from '#modules/platform/jobs'

/*
 * The web process's pg-boss instance (docs/03 §9, docs/09 §2.3): it only
 * sends, on the runtime role, so actions can call `sendJob(trx, …)` inside
 * their transactions. The worker (`node ace jobs:work`) starts its own
 * instance, which supervises, runs the schedules and works the queues. Tests
 * set their own instance (tests/support/jobs.ts).
 */
export default class JobsProvider {
  #boss: PgBoss | null = null

  constructor(protected app: ApplicationService) {}

  async ready() {
    if (this.app.getEnvironment() !== 'web' || hasJobBoss()) return
    const db = await this.app.container.make('lucid.db')
    const config = db.manager.get(db.primaryConnectionName)?.config as PostgreConfig | undefined
    const target = jobDatabaseOf(config)
    if (!target) return
    const logger = await this.app.container.make('logger')
    this.#boss = createJobBoss(target, 'web')
    this.#boss.on('error', (error) =>
      logger.error({ event: 'jobs.error', err: error }, 'pg-boss error')
    )
    await this.#boss.start()
    setJobBoss(this.#boss)
  }

  async shutdown() {
    if (!this.#boss) return
    await this.#boss.stop({ graceful: true, close: true })
    setJobBoss(null)
    this.#boss = null
  }
}

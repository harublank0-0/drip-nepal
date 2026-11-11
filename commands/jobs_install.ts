import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import {
  JOB_APP_ROLE,
  installJobSchema,
  jobDatabaseOf,
  jobSchemaGrants,
} from '#modules/platform/jobs'

/*
 * `node ace jobs:install`: the pg-boss schema step of the release step
 * (docs/11 §6.1, docs/09 §2.3). As the migrator, it installs or upgrades the
 * `pgboss` schema, waits for the upgrade's out-of-transaction commands,
 * creates or updates the application's queues (`JOB_QUEUES`), then grants
 * `dripnepal_app` USAGE and DML on it, idempotently. It runs after
 * `migration:run` and before the seeders, in the release container, in
 * development and in the test setup hook (docs/10 §3.2). The runtime role's
 * pg-boss instances never migrate. It fails (exit 1) if the runtime role is
 * missing in production, where an ungranted schema would stop the worker.
 */
export default class JobsInstall extends BaseCommand {
  static commandName = 'jobs:install'
  static description = 'Install or upgrade the pg-boss schema and grant it to the runtime role'
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'The migrator connection (default: the default connection)' })
  declare connection?: string

  async run() {
    const db = await this.app.container.make('lucid.db')
    const name = this.connection ?? db.primaryConnectionName
    const config = db.manager.get(name)?.config as PostgreConfig | undefined
    if (!config) {
      this.logger.error(`No database connection named "${name}"`)
      this.exitCode = 1
      return
    }
    const migrator = jobDatabaseOf(config)
    if (!migrator) {
      this.logger.error(`Connection "${name}" must give host, port, user, password and database`)
      this.exitCode = 1
      return
    }

    await installJobSchema(migrator)

    const role = await db
      .connection(name)
      .rawQuery('SELECT 1 FROM pg_roles WHERE rolname = ?', [JOB_APP_ROLE])
    if (role.rows.length === 0) {
      // Development without the two roles is allowed; production is not (docs/07 §4.10).
      if (this.app.inProduction) {
        this.logger.error(`Role ${JOB_APP_ROLE} does not exist; the pgboss schema is not granted`)
        this.exitCode = 1
        return
      }
      this.logger.warning(`Role ${JOB_APP_ROLE} does not exist; pgboss installed, not granted`)
      return
    }
    for (const grant of jobSchemaGrants()) await db.connection(name).rawQuery(grant)
    this.logger.success('pg-boss schema installed and granted')
  }
}

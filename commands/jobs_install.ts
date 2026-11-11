import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import { JOB_APP_ROLE, installJobSchema, jobSchemaGrants } from '#modules/platform/jobs'

/*
 * `node ace jobs:install`: the pg-boss schema step of the release step
 * (docs/11 §6.1, docs/09 §2.3). As the migrator, it installs or upgrades the
 * `pgboss` schema, then grants `dripnepal_app` USAGE and DML on it,
 * idempotently. It runs after `migration:run` and before the seeders, in
 * the release container, in development and in the test setup hook
 * (docs/10 §3.2). The runtime role's pg-boss instances never migrate.
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
    const connection = config?.connection
    if (!connection || typeof connection !== 'object' || !('user' in connection)) {
      this.logger.error(`No PostgreSQL connection named "${name}"`)
      this.exitCode = 1
      return
    }

    await installJobSchema({
      host: String(connection.host),
      port: Number(connection.port),
      user: String(connection.user),
      password: String(connection.password),
      database: String(connection.database),
    })

    // Granted only where the role exists, as the baseline grants are (docs/07 §4.10).
    const role = await db
      .connection(name)
      .rawQuery('SELECT 1 FROM pg_roles WHERE rolname = ?', [JOB_APP_ROLE])
    if (role.rows.length > 0) {
      for (const grant of jobSchemaGrants()) await db.connection(name).rawQuery(grant)
    } else {
      this.logger.warning(`Role ${JOB_APP_ROLE} does not exist; no pgboss grants made`)
    }
    this.logger.success('pg-boss schema installed and granted')
  }
}

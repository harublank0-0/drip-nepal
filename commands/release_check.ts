import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { MigrationRunner } from '@adonisjs/lucid/migration'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type { ApplicationService } from '@adonisjs/core/types'

/*
 * `node ace release:check` (proposed name): the release checks that the
 * release step runs after the migrations, the pg-boss schema step and the
 * reference seeders, in every deploy (docs/11 §5.4, §6.1; docs/09 §9.2,
 * §9.3 step 5). Each check counts the rows that would fail the deploy; any
 * row fails it with exit 1. The output names each failed check and its
 * count, never a row's values, so no email reaches the deploy log.
 *
 * - T-OPS-013: no migration is pending, and no applied migration lost its file.
 * - T-OPS-014: no index is left invalid by a failed concurrent build.
 * - T-OPS-023: no known seed user: an email in a `.invalid` domain that is
 *   not an anonymisation placeholder (development seeders use
 *   `dev.dripnepal.invalid`), or the prototype's `demo@dripnepal.com`
 *   (RF-05, audit A5-01).
 */

type CheckContext = { app: ApplicationService; client: QueryClientContract; connection: string }

type Check = { id: string; name: string; count: (context: CheckContext) => Promise<number> }

async function countRows(client: QueryClientContract, sql: string) {
  const result = await client.rawQuery(`SELECT count(*)::int AS n FROM (${sql}) AS failing`)
  return result.rows[0].n as number
}

export const RELEASE_CHECKS: Check[] = [
  {
    id: 'T-OPS-013',
    name: 'no pending migration',
    count: async ({ app, connection }) => {
      const db = await app.container.make('lucid.db')
      // Read only: getList() compares the files with `adonis_schema` and runs nothing.
      const runner = new MigrationRunner(db, app, { direction: 'up', connectionName: connection })
      const list = await runner.getList()
      return list.filter((node) => node.status === 'pending' || node.status === 'corrupt').length
    },
  },
  {
    id: 'T-OPS-014',
    name: 'no invalid index',
    count: ({ client }) =>
      countRows(client, 'SELECT indexrelid FROM pg_index WHERE NOT indisvalid'),
  },
  {
    id: 'T-OPS-023',
    name: 'no known seed user',
    count: ({ client }) =>
      countRows(
        client,
        `SELECT id FROM users
          WHERE (email::text LIKE '%.invalid' AND status <> 'anonymized')
             OR email = 'demo@dripnepal.com'`
      ),
  },
]

export default class ReleaseCheck extends BaseCommand {
  static commandName = 'release:check'
  static description = 'Run the release checks; any failing row exits 1'
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'The connection to check (default: the default connection)' })
  declare connection?: string

  async run() {
    const db = await this.app.container.make('lucid.db')
    const connection = this.connection ?? db.primaryConnectionName
    if (!db.manager.has(connection)) {
      this.logger.error(`No database connection named "${connection}"`)
      this.exitCode = 1
      return
    }
    const client = db.connection(connection)
    for (const check of RELEASE_CHECKS) {
      const failing = await check.count({ app: this.app, client, connection })
      if (failing > 0) {
        this.logger.error(`${check.id} ${check.name}: ${failing} failing`)
        this.exitCode = 1
      } else {
        this.logger.success(`${check.id} ${check.name}`)
      }
    }
  }
}

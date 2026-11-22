import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import type { PgBoss } from 'pg-boss'
import {
  DEAD_LETTER_RULES,
  JOB_SCHEMA,
  createJobBoss,
  jobDatabaseOf,
  type DeadLetterRule,
} from '#modules/platform/jobs'

/*
 * `node ace jobs:redrive dlq.<queue>` (docs/09 §9.7, docs/11 §8.3): moves a
 * dead-letter queue's jobs back to their queue after the cause is fixed, or
 * deletes them where docs/11 §8.2 says the work is re-sent anyway. Each
 * queue has one rule, `DEAD_LETTER_RULES`:
 *
 * - `redrive`: pg-boss's `redrive` re-creates each dead letter as a new job
 *   on its queue, with the queue's settings as they are now, and deletes
 *   the dead letter in the same statement, so a job is never moved twice.
 *   A dead letter outside its window (`keep_until` before the database's
 *   time, docs/11 §8.1) is never redriven: it is left for pg-boss's
 *   retention purge, and its delivery row stays `queued`. A redriven job
 *   starts its queue's retention again (7 days on the `notifications.*`
 *   queues), which docs/07 §3.8 rule 2 accepts: `token_enc` no longer
 *   decrypts after the token's expiry, a completed job is deleted after a
 *   day, and the handler fails an expired token without sending.
 * - `discard`: the dead letters are deleted, and only with `--discard`,
 *   which a `redrive` queue refuses: the operator states the action, and
 *   the command checks it against the rule.
 *
 * `--limit` (1 to 500, default 500) bounds one run, oldest first, so a
 * large queue drains in batches the operator watches (docs/11 §8.3 step 4).
 * `--dry-run` changes nothing and prints what the same run would do. The
 * output is counts, queue names and times only, never a payload, which may
 * carry an encrypted token (docs/09 §7.3). What a redriven job then does is
 * its handler's: `notifications.send_email` sends a row only while it is
 * still `queued`, and fails a token email whose token can no longer be
 * redeemed without sending it (docs/05 §8.14).
 *
 * The command starts its own pg-boss instance as its database role, with a
 * pool of one and neither supervision nor schedules (docs/11 §8.3). Exit 1,
 * with nothing changed, on a name that is not the dead-letter queue of an
 * application queue, a rule mismatch, a limit out of range or a missing
 * dead-letter queue; exit 1 too when a redrive moved fewer jobs than it
 * chose, so a script can tell a partial run from a full one.
 */

// docs/11 §8.3 step 4: batches of at most 500 [Assumption there].
export const REDRIVE_LIMIT_MAX = 500

// Dead letters read per page while choosing a batch.
const PAGE = 1000

// Fresh scans after a page's last row was deleted meanwhile, before giving up.
const RESCANS = 3

export type Batch = {
  ids: string[]
  oldest: Date | null
  newest: Date | null
  // Skipped because past their retention (redrive only).
  expired: number
  // More dead letters wait behind this batch.
  more: boolean
}

export type BatchOptions = {
  limit: number
  // Skip dead letters whose `keep_until` is not after `now` (a redrive).
  skipExpired: boolean
  // The database's time, the clock pg-boss's retention purge compares with.
  now: Date
  pageSize?: number
}

/*
 * One scan of `dlq`, oldest first, page by page. The payloads are read
 * with the rows but never leave this function.
 */
async function scan(boss: Pick<PgBoss, 'findJobs'>, dlq: string, options: BatchOptions) {
  const pageSize = options.pageSize ?? PAGE
  const now = options.now.getTime()
  const batch: Batch = { ids: [], oldest: null, newest: null, expired: 0, more: false }
  let after: string | undefined
  for (;;) {
    const page = await boss.findJobs(dlq, { queued: true, limit: pageSize, after })
    for (const job of page) {
      if (options.skipExpired && new Date(job.keepUntil).getTime() <= now) {
        batch.expired += 1
        continue
      }
      if (batch.ids.length === options.limit) {
        batch.more = true
        return batch
      }
      batch.ids.push(job.id)
      batch.oldest ??= job.createdOn
      batch.newest = job.createdOn
    }
    if (page.length < pageSize) return batch
    after = page[page.length - 1].id
  }
}

// pg-boss refuses to page after a row deleted since the previous page (its retention purge, another run).
const anchorGone = (error: unknown) =>
  error instanceof Error && error.message.includes('after names a row that no longer exists')

/*
 * The oldest dead letters of `dlq`, at most `limit`; for a redrive, one
 * outside its window is skipped and counted. A scan whose next page lost
 * its anchor starts again from the oldest, at most `RESCANS` times.
 */
export async function chooseBatch(
  boss: Pick<PgBoss, 'findJobs'>,
  dlq: string,
  options: BatchOptions
): Promise<Batch> {
  for (let rescan = 0; ; rescan++) {
    try {
      return await scan(boss, dlq, options)
    } catch (error) {
      if (rescan >= RESCANS || !anchorGone(error)) throw error
    }
  }
}

// The database's time, as pg-boss's purge reads it (`job_now()`), on the instance's own connection.
async function databaseNow(boss: PgBoss) {
  const result = await boss.getDb().executeSql(`SELECT ${JOB_SCHEMA}.job_now() AS now`)
  return new Date(result.rows[0].now)
}

const iso = (date: Date | null) => (date ? new Date(date).toISOString() : '-')

export default class JobsRedrive extends BaseCommand {
  static commandName = 'jobs:redrive'
  static description = 'Redrive a dead-letter queue to its queue, or discard it (docs/11 §8.2)'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'The dead-letter queue, dlq.<queue>' })
  declare queue: string

  @flags.number({
    description: `Most dead letters to move or discard in this run (1 to ${REDRIVE_LIMIT_MAX})`,
    default: REDRIVE_LIMIT_MAX,
  })
  declare limit: number

  @flags.boolean({ description: 'Print what the run would do and change nothing' })
  declare dryRun?: boolean

  @flags.boolean({ description: 'Delete the dead letters of a queue whose rule is discard' })
  declare discard?: boolean

  #fail(message: string) {
    this.logger.error(message)
    this.exitCode = 1
  }

  // The queue the dead letters came from and its rule, or null after reporting why not.
  #ruleOf(dlq: string): { source: string; rule: DeadLetterRule } | null {
    const rules: Record<string, DeadLetterRule> = DEAD_LETTER_RULES
    const source = dlq.startsWith('dlq.') ? dlq.slice('dlq.'.length) : null
    if (source === null || !Object.hasOwn(rules, source)) {
      this.#fail(`${dlq} is not the dead-letter queue of an application queue (dlq.<queue>)`)
      return null
    }
    const rule = rules[source]
    if (rule === 'redrive' && this.discard) {
      this.#fail(`${dlq} is redriven after the fix, never discarded (docs/11 §8.2)`)
      return null
    }
    if (rule === 'discard' && !this.discard) {
      this.#fail(`${dlq} is discarded, not redriven (docs/11 §8.2); run it with --discard`)
      return null
    }
    return { source, rule }
  }

  async #startJobBoss() {
    const db = await this.app.container.make('lucid.db')
    const config = db.manager.get(db.primaryConnectionName)?.config as PostgreConfig | undefined
    const database = jobDatabaseOf(config)
    if (!database) throw new Error('The default connection must give host, user and database')
    const boss = createJobBoss(database, 'web')
    boss.on('error', (error: Error) => this.logger.error(`pg-boss: ${error.message}`))
    await boss.start()
    return boss
  }

  async run() {
    const dlq = this.queue
    const target = this.#ruleOf(dlq)
    if (!target) return
    const limit = this.limit
    if (!Number.isInteger(limit) || limit < 1 || limit > REDRIVE_LIMIT_MAX) {
      this.#fail(`--limit must be a whole number from 1 to ${REDRIVE_LIMIT_MAX}`)
      return
    }

    const boss = await this.#startJobBoss()
    try {
      if (!(await boss.getQueue(dlq))) {
        this.#fail(`${dlq} does not exist; run node ace jobs:install`)
        return
      }
      await this.#apply(boss, dlq, target.source, target.rule, limit)
    } finally {
      await boss.stop({ graceful: true, close: true })
    }
  }

  async #apply(boss: PgBoss, dlq: string, source: string, rule: DeadLetterRule, limit: number) {
    const now = await databaseNow(boss)
    const batch = await chooseBatch(boss, dlq, { limit, skipExpired: rule === 'redrive', now })
    const verb = rule === 'redrive' ? `redrive to ${source}` : 'discard'
    const count = batch.ids.length
    const span = `dead-lettered ${iso(batch.oldest)} to ${iso(batch.newest)}`

    if (count === 0) {
      this.logger.info(`${dlq}: nothing to ${verb}`)
    } else if (this.dryRun) {
      this.logger.info(`${dlq}: ${count} to ${verb} (${span}); dry run, nothing changed`)
    } else if (rule === 'redrive') {
      // `dlq.<queue>` collects from `<queue>` only (docs/09 §2.3 item 5), so the destination is named.
      const moved = await boss.redrive(dlq, { ids: batch.ids, limit: count, destination: source })
      this.logger.success(`${dlq}: ${moved} redriven to ${source} (${span})`)
      if (moved < count) {
        this.#fail(
          `${dlq}: ${count - moved} not moved; another run took them first, or ${source} refused them`
        )
      }
    } else {
      // pg-boss 12.38.0 types CommandResponse as empty; it carries `affected` (manager.js).
      const response = (await boss.deleteJob(dlq, batch.ids)) as { affected?: number }
      this.logger.success(`${dlq}: ${response.affected ?? 0} discarded (${span})`)
    }

    if (batch.expired > 0) {
      this.logger.info(
        `${dlq}: ${batch.expired} past their retention, not redriven; pg-boss's retention purge deletes them`
      )
    }
    if (batch.more) this.logger.info(`${dlq}: more dead letters wait; run the command again`)
  }
}

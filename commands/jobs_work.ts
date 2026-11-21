import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import { JOB_HANDLERS, JOB_SCHEDULES, type JobAttempt } from '../app/job_handlers.js'
import { createJobBoss, jobDatabaseOf, setJobBoss, type QueueName } from '#modules/platform/jobs'

/*
 * `node ace jobs:work`: the worker process (docs/03 §9, docs/11 §4.4). It
 * starts the worker's pg-boss instance (it supervises and runs the
 * schedules), registers every handler of `JOB_HANDLERS` and the schedules of
 * `JOB_SCHEDULES`, and runs until it is stopped. A handler that throws is
 * retried by pg-boss up to the queue's `retryLimit`, then moved to the
 * queue's dead-letter queue.
 */
export default class JobsWork extends BaseCommand {
  static commandName = 'jobs:work'
  static description = 'Run the job worker: work the queues and run the schedules'
  static options: CommandOptions = { startApp: true, staysAlive: true }

  async run() {
    const db = await this.app.container.make('lucid.db')
    const config = db.manager.get(db.primaryConnectionName)?.config as PostgreConfig | undefined
    const target = jobDatabaseOf(config)
    if (!target) {
      this.logger.error('The default connection must give host, port, user, password and database')
      this.exitCode = 1
      return
    }
    const boss = createJobBoss(target, 'worker')
    boss.on('error', (error) => this.logger.error(`pg-boss: ${(error as Error).message}`))
    await boss.start()
    setJobBoss(boss)

    for (const [queue, handler] of Object.entries(JOB_HANDLERS) as [
      QueueName,
      (p: never, a: JobAttempt) => Promise<unknown>,
    ][]) {
      await boss.work(queue, { includeMetadata: true, localConcurrency: 2 }, async (jobs) => {
        for (const job of jobs) {
          const data = job.data as { request_id?: string | null }
          await handler(job.data as never, {
            retryCount: job.retryCount,
            retryLimit: job.retryLimit,
            requestId: data.request_id ?? null,
          })
        }
      })
    }
    for (const schedule of JOB_SCHEDULES) {
      await boss.schedule(
        schedule.queue,
        schedule.cron,
        { ...schedule.data, request_id: null, causation_id: null },
        {
          tz: 'Asia/Kathmandu',
        }
      )
    }
    this.logger.info(
      `worker started: ${Object.keys(JOB_HANDLERS).length} queues, ${JOB_SCHEDULES.length} schedules`
    )

    const stop = async () => {
      await boss.stop({ graceful: true, close: true })
      setJobBoss(null)
    }
    this.app.terminating(stop)
  }
}

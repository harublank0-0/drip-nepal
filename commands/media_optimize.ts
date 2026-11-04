import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/*
 * One-time conversion of product photos uploaded before photos were resized
 * (PhotoBackfillService). Take a database and uploads backup first
 * (DEPLOY.md, "Backups"): it deletes each original once its row points at
 * the new WebP files. Safe to run again.
 */
export default class MediaOptimize extends BaseCommand {
  static commandName = 'media:optimize'
  static description =
    'Convert product photos uploaded before resizing into 1600 px and 640 px WebP files, and delete the originals'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    // Photo URLs come from the router's `drive.fs.serve` route, and only the
    // HTTP server commits routes; a command has to do it itself.
    const router = await this.app.container.make('router')
    router.commit()

    const { default: PhotoBackfillService } =
      await import('#modules/products/services/photo_backfill_service')
    const summary = await new PhotoBackfillService().run()

    this.logger.info(
      `Converted ${summary.converted} photo(s); skipped ${summary.skipped} already converted or stored elsewhere.`
    )
    for (const failure of summary.failed) {
      this.logger.warning(`Photo ${failure.mediaId} was left as it was: ${failure.reason}`)
    }
    if (summary.failed.length > 0) this.exitCode = 1
  }
}

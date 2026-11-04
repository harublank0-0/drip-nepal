import { dirname } from 'node:path'
import drive from '@adonisjs/drive/services/main'
import ProductMedia from '#models/product_media'
import { PhotoRejected } from '#modules/products/photos'
import { deletePhotoFiles, storeProductPhoto } from '#modules/products/services/photo_storage'

export type BackfillSummary = {
  converted: number
  skipped: number
  failed: { mediaId: string; reason: string }[]
}

/*
 * Converts product photos uploaded before photos were resized: each stored
 * original becomes the two WebP files new uploads get, and the original
 * (with any GPS data in it) is deleted once the row points at the new
 * files. Safe to run again: converted rows have a `thumbnail_url` and are
 * skipped, as are photos stored elsewhere (the demo data's remote URLs).
 * Run once with `node ace media:optimize`.
 */
export default class PhotoBackfillService {
  async run(): Promise<BackfillSummary> {
    const summary: BackfillSummary = { converted: 0, skipped: 0, failed: [] }
    const rows = await ProductMedia.query().where('type', 'image').orderBy('created_at', 'asc')

    for (const media of rows) {
      const originalKey: string | undefined = media.metadata?.key
      if (media.provider !== 'drive' || !originalKey || media.thumbnailUrl) {
        summary.skipped++
        continue
      }

      let files
      try {
        const input = Buffer.from(await drive.use().getBytes(originalKey))
        files = await storeProductPhoto(dirname(originalKey), input)
      } catch (error) {
        const reason =
          error instanceof PhotoRejected
            ? error.message
            : `The file ${originalKey} couldn't be read.`
        summary.failed.push({ mediaId: media.id, reason })
        continue
      }

      try {
        media.merge({
          url: files.url,
          thumbnailUrl: files.thumbnailUrl,
          metadata: {
            ...media.metadata,
            key: files.key,
            thumbnailKey: files.thumbnailKey,
            width: files.width,
            height: files.height,
          },
        })
        await media.save()
      } catch (error) {
        await deletePhotoFiles([files.key, files.thumbnailKey])
        throw error
      }

      await deletePhotoFiles([originalKey])
      summary.converted++
    }

    return summary
  }
}

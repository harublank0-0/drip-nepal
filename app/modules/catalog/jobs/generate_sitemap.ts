import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import {
  readStoredSitemap,
  SITEMAP_INDEX_KEY,
  sitemapCaches,
  sitemapEntries,
  sitemapFileKey,
  sitemapIndexXml,
  splitSitemap,
  urlsetXml,
} from '#modules/catalog/sitemap'
import { ObjectStorage } from '#modules/platform/ports/object_storage'

/*
 * `catalog.generate_sitemap`, daily at 04:00 Asia/Kathmandu: writes the
 * files, then the index. Storage calls run outside any transaction
 * (T-ARCH-003). A failed run is retried three times and then discarded: the next
 * night's run does the work (11 §8.4).
 */
export async function generateSitemap(
  requestId: string | null,
  options: { maxUrls?: number } = {}
): Promise<{ urls: number; files: number }> {
  const storage = await app.container.make(ObjectStorage)
  const ctx = { requestId, timeoutMs: 30_000 }
  const previous = await readStoredSitemap(storage, SITEMAP_INDEX_KEY, requestId)
  // The files the last finished run named; one a failed run wrote past its index stays, unnamed.
  const previousFiles = previous ? (previous.toString('utf8').match(/<sitemap>/g)?.length ?? 0) : 0
  const entries = await sitemapEntries()
  const chunks = splitSitemap(entries, options.maxUrls)
  const files = chunks.length
  for (const [index, chunk] of chunks.entries()) {
    const n = index + 1
    await storage.put(
      'private',
      sitemapFileKey(n),
      Buffer.from(urlsetXml(chunk)),
      {
        contentType: 'application/xml',
      },
      ctx
    )
  }
  await storage.put(
    'private',
    SITEMAP_INDEX_KEY,
    Buffer.from(sitemapIndexXml(files, new Date().toISOString())),
    { contentType: 'application/xml' },
    ctx
  )
  for (let n = files + 1; n <= previousFiles; n++) {
    await storage.delete('private', sitemapFileKey(n), ctx)
  }
  // Only this process's reads: the web process's cache ages out within 5 minutes.
  sitemapCaches.delete(storage)
  logger.info({ urls: entries.length, files }, 'sitemap written')
  return { urls: entries.length, files }
}

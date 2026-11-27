import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { appUrl } from '#config/storefront'
import { productPath } from '#modules/catalog/domain/identifiers'
import { NAVIGATION } from '#modules/catalog/navigation'
import {
  activeCategoryTree,
  type CategoryTreeNode,
  listedCategoryPath,
  listingFilterAttributes,
} from '#modules/catalog/queries'
import { ObjectStorage } from '#modules/platform/ports/object_storage'

/*
 * The storefront's sitemap (01 AC-FR-SRCH-005-3; ADR-0017 decision 8;
 * docs/03 §9 `catalog.generate_sitemap`; R1-S part 3d-iii-a). It lists, on
 * their canonical URLs only, the home page, the navigation entries whose
 * page answers (its category listed, its audience offered), every active
 * category whose ancestors are all active (`/c/{slug}`), and every product
 * the storefront lists (the read model's rows: published, of an active
 * shop). No entry carries `lastmod`: the nightly rebuild refreshes every
 * listing row, so its time would claim a daily change crawlers learn to
 * ignore. The shop pages wait for other vendors (08 §2.2), so no shop is
 * listed.
 *
 * The files go to the private bucket, which the web process may read (11
 * §3.6): `sitemaps/urls-{n}.xml`, at most 50,000 URLs each, then the index
 * `sitemaps/sitemap.xml` naming them, written last so it never names a
 * file not yet written. A run overwrites the same keys, and deletes the
 * numbered files a larger earlier run left above the new count.
 * `/sitemap.xml` and `/sitemaps/urls-{n}.xml` serve them, each read kept
 * in the process for 5 minutes, so crawler traffic costs few storage reads.
 */
export const SITEMAP_MAX_URLS = 50_000
export const SITEMAP_INDEX_KEY = 'sitemaps/sitemap.xml'
export const sitemapFileKey = (n: number) => `sitemaps/urls-${n}.xml`
// A file of 50,000 URLs stays well under this; anything larger is not ours.
const SITEMAP_MAX_BYTES = 60 * 1024 * 1024
const PRODUCT_BATCH = 1000

export type SitemapEntry = { loc: string; lastmod: string | null }

function flatten(nodes: CategoryTreeNode[]): string[] {
  return nodes.flatMap((node) => [node.slug, ...flatten(node.children)])
}

export async function sitemapEntries(options: { batch?: number } = {}): Promise<SitemapEntry[]> {
  const batch = options.batch ?? PRODUCT_BATCH
  const entries: SitemapEntry[] = [{ loc: '/', lastmod: null }]
  const filterable = await listingFilterAttributes()
  const audiences = filterable.get('audience')?.values
  for (const entry of NAVIGATION) {
    if (!audiences?.has(entry.audience)) continue
    if (entry.categorySlug !== null && (await listedCategoryPath(entry.categorySlug)) === null) {
      continue
    }
    entries.push({ loc: entry.path, lastmod: null })
  }
  for (const slug of flatten(await activeCategoryTree())) {
    entries.push({ loc: `/c/${slug}`, lastmod: null })
  }
  let after = ''
  for (;;) {
    const rows: { public_id: string; slug: string }[] = await db
      .from('product_listings')
      .where('public_id', '>', after)
      .orderBy('public_id')
      .limit(batch)
      .select('public_id', 'slug')
    for (const row of rows) {
      entries.push({ loc: productPath(row.slug, row.public_id), lastmod: null })
    }
    if (rows.length < batch) break
    after = rows.at(-1)!.public_id
  }
  return entries
}

const escapeXml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>'
const NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'

export function urlsetXml(entries: SitemapEntry[]) {
  const urls = entries.map((entry) => {
    const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''
    return `<url><loc>${escapeXml(appUrl + entry.loc)}</loc>${lastmod}</url>`
  })
  return `${XML_HEAD}\n<urlset xmlns="${NS}">\n${urls.join('\n')}\n</urlset>\n`
}

export function sitemapIndexXml(files: number, lastmod: string) {
  const items = Array.from(
    { length: files },
    (_, index) =>
      `<sitemap><loc>${escapeXml(`${appUrl}/${sitemapFileKey(index + 1)}`)}</loc><lastmod>${lastmod}</lastmod></sitemap>`
  )
  return `${XML_HEAD}\n<sitemapindex xmlns="${NS}">\n${items.join('\n')}\n</sitemapindex>\n`
}

// The files' entries, at most `max` each, and always one file, even for an empty catalogue.
export function splitSitemap(entries: SitemapEntry[], max = SITEMAP_MAX_URLS): SitemapEntry[][] {
  const chunks: SitemapEntry[][] = []
  for (let start = 0; start < entries.length; start += max)
    chunks.push(entries.slice(start, start + max))
  return chunks.length === 0 ? [[]] : chunks
}

// What a store's sitemap files read as, for 5 minutes, null included; one cache per store.
const CACHE_MS = 5 * 60 * 1000
export const sitemapCaches = new WeakMap<
  ObjectStorage,
  Map<string, { at: number; body: Buffer | null }>
>()

export async function readStoredSitemap(
  storage: ObjectStorage,
  key: string,
  requestId: string | null
): Promise<Buffer | null> {
  const ctx = { requestId, timeoutMs: 10_000 }
  // A second try, when the nightly run overwrote the file between the two calls.
  for (let attempt = 0; attempt < 2; attempt++) {
    const head = await storage.head('private', key, ctx)
    if (!head) return null
    const read = await storage.read(
      'private',
      key,
      { ifMatch: head.etag, maxBytes: SITEMAP_MAX_BYTES },
      ctx
    )
    if (read.outcome === 'read') return read.body
    if (read.outcome === 'too_large') {
      logger.warn({ key }, 'sitemap file over its size limit')
      return null
    }
    if (read.outcome === 'missing') return null
  }
  return null
}

// A sitemap file as stored, or null when none has been written yet.
export async function readSitemap(key: string, requestId: string | null): Promise<Buffer | null> {
  const storage = await app.container.make(ObjectStorage)
  const cache = sitemapCaches.get(storage) ?? new Map<string, { at: number; body: Buffer | null }>()
  sitemapCaches.set(storage, cache)
  const kept = cache.get(key)
  if (kept && Date.now() - kept.at < CACHE_MS) return kept.body
  const body = await readStoredSitemap(storage, key, requestId)
  cache.set(key, { at: Date.now(), body })
  return body
}

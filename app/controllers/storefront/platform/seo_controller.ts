import type { HttpContext } from '@adonisjs/core/http'
import { appUrl } from '#config/storefront'
import { DomainError } from '#exceptions/domain_error'
import { readSitemap, SITEMAP_INDEX_KEY, sitemapFileKey } from '#modules/catalog/sitemap'

/*
 * The crawler files (ADR-0017 decision 8; 01 AC-FR-SRCH-005-3; R1-S part
 * 3d-iii-a).
 *
 * - `robots.txt` allows everything and names the sitemap. The private and
 *   non-content pages are not disallowed: a crawler that may not fetch a
 *   page never sees its `X-Robots-Tag: noindex`.
 * - `/sitemap.xml` and `/sitemaps/urls-{n}.xml` serve the files the
 *   nightly `catalog.generate_sitemap` wrote, or the 404 page before its
 *   first run.
 */
// Private: every routed answer carries the session and XSRF cookies, which a shared cache must not keep.
const CRAWLER_CACHE = 'private, max-age=3600'

export default class SeoController {
  robots({ response }: HttpContext) {
    response.header('Content-Type', 'text/plain; charset=utf-8')
    response.header('Cache-Control', CRAWLER_CACHE)
    return `User-agent: *\nAllow: /\n\nSitemap: ${appUrl}/sitemap.xml\n`
  }

  async sitemapIndex(ctx: HttpContext) {
    return this.serve(ctx, SITEMAP_INDEX_KEY)
  }

  async sitemapFile(ctx: HttpContext) {
    // The route matched `urls-{n}.xml`; a number past the files written is the 404 page.
    const n = Number(/\d+/.exec(String(ctx.params.file))![0])
    return this.serve(ctx, sitemapFileKey(n))
  }

  private async serve(ctx: HttpContext, key: string) {
    const body = await readSitemap(key, ctx.request.id() ?? null)
    if (body === null) throw new DomainError('NOT_FOUND')
    ctx.response.header('Content-Type', 'application/xml; charset=utf-8')
    ctx.response.header('Cache-Control', CRAWLER_CACHE)
    return body
  }
}

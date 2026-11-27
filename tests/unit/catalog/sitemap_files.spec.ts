import { test } from '@japa/runner'
import { appUrl } from '#config/storefront'
import { sitemapIndexXml, splitSitemap, urlsetXml } from '#modules/catalog/sitemap'

/*
 * T-CAT-017 (the unit part): the sitemap's files (01 AC-FR-SRCH-005-3): at
 * most 50,000 URLs each, the index naming each file, and XML escaping.
 */
test.group('T-CAT-017 the sitemap files', () => {
  test('T-CAT-017 at most the limit per file, and always one file', ({ assert }) => {
    const entries = Array.from({ length: 5 }, (_, n) => ({ loc: `/c/x${n}`, lastmod: null }))
    assert.deepEqual(
      splitSitemap(entries, 2).map((chunk) => chunk.length),
      [2, 2, 1]
    )
    assert.deepEqual(splitSitemap([], 2), [[]])
  })

  test('T-CAT-017 the index names each file; URLs are absolute and escaped', ({ assert }) => {
    const index = sitemapIndexXml(2, '2026-11-27T00:00:00.000Z')
    assert.include(index, `<loc>${appUrl}/sitemaps/urls-1.xml</loc>`)
    assert.include(index, `<loc>${appUrl}/sitemaps/urls-2.xml</loc>`)
    assert.include(index, '<lastmod>2026-11-27T00:00:00.000Z</lastmod>')
    const urlset = urlsetXml([
      { loc: '/p/a-b-1234abcd', lastmod: '2026-11-01T00:00:00.000Z' },
      { loc: "/c/x&y'<>", lastmod: null },
    ])
    assert.include(urlset, '<?xml version="1.0" encoding="UTF-8"?>')
    assert.include(
      urlset,
      `<url><loc>${appUrl}/p/a-b-1234abcd</loc><lastmod>2026-11-01T00:00:00.000Z</lastmod></url>`
    )
    assert.include(urlset, `<url><loc>${appUrl}/c/x&amp;y&apos;&lt;&gt;</loc></url>`)
  })
})

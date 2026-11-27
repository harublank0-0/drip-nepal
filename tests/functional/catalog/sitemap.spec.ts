import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { appUrl } from '#config/storefront'
import { generateSitemap } from '#modules/catalog/jobs/generate_sitemap'
import { SITEMAP_INDEX_KEY, sitemapEntries, sitemapFileKey } from '#modules/catalog/sitemap'
import { testBrowser } from '#tests/support/browser'
import { activeShop, listed, valueId } from '#tests/support/listings'
import { fakeObjectStorage } from '#tests/support/object_storage'

/*
 * The crawler files (01 AC-FR-SRCH-005-3; ADR-0017 decision 8; docs/03 §9;
 * R1-S part 3d-iii-a). The store is the in-memory fake of the
 * `ObjectStorage` port.
 *
 * - T-CAT-017: `catalog.generate_sitemap` writes the index and its files
 *   to the private bucket; they list the home page, the navigation entries
 *   whose page answers, the listed categories and the listed products, on
 *   canonical URLs, and nothing the storefront does not show; before a run
 *   `/sitemap.xml` is the 404 page.
 * - T-CAT-006 (the crawler part): every sitemap URL answers 200;
 *   `robots.txt` names the sitemap and disallows nothing; the private and
 *   non-content pages answer `X-Robots-Tag: noindex`, redirects and 404s
 *   included, and the storefront pages do not.
 */
const request = (path: string) => testBrowser().request(path, { redirect: 'manual' })
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])

test.group('T-CAT-017 the sitemap', (group) => {
  let storage: ReturnType<typeof fakeObjectStorage>
  group.each.setup(() => {
    storage = fakeObjectStorage()
    return () => storage.restore()
  })

  test('T-CAT-017 before the first run there is no sitemap', async ({ assert }) => {
    const response = await request('/sitemap.xml')
    assert.equal(response.status, 404)
  })

  test('T-CAT-017 a run writes the index and the URLs the storefront shows', async ({ assert }) => {
    const shop = await activeShop()
    const men = await valueId('audience', 'men')
    const tee = await listed(shop, { title: 'Sitemap tee', audience: [men] })
    // A category made inactive, rolled back with the test: it and its entry leave the sitemap.
    await db.from('categories').where('slug', 'watches').update({ is_active: false })
    const result = await generateSitemap(null)
    assert.equal(result.files, 1)
    assert.isTrue(storage.fake.has('private', SITEMAP_INDEX_KEY))

    const index = await request('/sitemap.xml')
    assert.equal(index.status, 200)
    assert.equal(index.headers.get('content-type'), 'application/xml; charset=utf-8')
    assert.deepEqual(locs(await index.text()), [`${appUrl}/${sitemapFileKey(1)}`])

    const file = await request(`/${sitemapFileKey(1)}`)
    const urls = locs(await file.text())
    assert.lengthOf(urls, result.urls)
    for (const path of ['/', '/men', '/women', '/men/t-shirts', '/c/clothing', '/c/t-shirts']) {
      assert.include(urls, `${appUrl}${path}`, path)
    }
    assert.include(urls, `${appUrl}/p/${tee.slug}-${tee.publicId.toLowerCase()}`)
    for (const path of ['/c/watches', '/c/analog-watches', '/men/watches', '/search']) {
      assert.notInclude(urls, `${appUrl}${path}`, path)
    }
    // Canonical URLs only: no query string, no upper case public ID.
    assert.isFalse(urls.some((url) => url.includes('?')))

    // No lastmod: the nightly rebuild refreshes every row, so the time would claim a daily change.
    const again = await request(`/${sitemapFileKey(1)}`)
    assert.notInclude(await again.text(), '<lastmod>')
    // The router stack sets cookies on every answer, so no shared cache may keep these.
    for (const path of ['/sitemap.xml', `/${sitemapFileKey(1)}`, '/robots.txt']) {
      const response = await request(path)
      assert.equal(response.headers.get('cache-control'), 'private, max-age=3600', path)
    }

    // T-CAT-006: every URL in it answers 200.
    for (const url of urls) {
      const response = await request(url.slice(appUrl.length))
      assert.equal(response.status, 200, url)
    }
  })

  test('T-CAT-017 an audience not offered leaves its entries out; products page past a batch', async ({
    assert,
  }) => {
    const shop = await activeShop()
    const first = await listed(shop, { title: 'Batch tee one' })
    const second = await listed(shop, { title: 'Batch tee two' })
    await db
      .from('attribute_values')
      .whereIn('attribute_id', db.from('attributes').where('code', 'audience').select('id'))
      .where('code', 'men')
      .update({ is_active: false })
    const found = await sitemapEntries({ batch: 1 })
    const entries = found.map((entry) => entry.loc)
    assert.isFalse(entries.some((loc) => loc === '/men' || loc.startsWith('/men/')))
    assert.include(entries, '/women')
    for (const made of [first, second]) {
      assert.include(entries, `/p/${made.slug}-${made.publicId.toLowerCase()}`)
    }
  })

  test('T-CAT-017 a smaller run deletes the files it no longer needs', async ({ assert }) => {
    const larger = await generateSitemap(null, { maxUrls: 30 })
    assert.isAbove(larger.files, 1)
    assert.isTrue(storage.fake.has('private', sitemapFileKey(larger.files)))
    const smaller = await generateSitemap(null)
    assert.equal(smaller.files, 1)
    for (let n = 2; n <= larger.files; n++) {
      assert.isFalse(storage.fake.has('private', sitemapFileKey(n)), `urls-${n}`)
    }
    assert.isTrue(storage.fake.has('private', sitemapFileKey(1)))
  })
})

test.group('T-CAT-006 the crawler headers', () => {
  test('T-CAT-006 robots.txt names the sitemap and disallows nothing', async ({ assert }) => {
    const response = await request('/robots.txt')
    const text = await response.text()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8')
    assert.include(text, `Sitemap: ${appUrl}/sitemap.xml`)
    assert.notInclude(text, 'Disallow')
  })

  test('T-CAT-006 private pages answer noindex, redirects included; storefront pages do not', async ({
    assert,
  }) => {
    // The pages of ADR-0017 decision 8, listed here, not read from the code under test;
    // each and a page below it: redirects, sign-in pages and 404s alike.
    const privatePages = [
      '/seller',
      '/account',
      '/admin',
      '/cart',
      '/checkout',
      '/payments',
      '/login',
      '/signup',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
      '/mfa',
    ]
    for (const prefix of privatePages) {
      for (const path of [prefix, `${prefix}/anything`]) {
        const response = await request(path)
        assert.equal(
          response.headers.get('x-robots-tag'),
          'noindex',
          `${path} (${response.status})`
        )
      }
    }
    const payments = await request('/payments/khalti/return')
    assert.equal(payments.headers.get('x-robots-tag'), 'noindex')
    for (const path of ['/', '/men', '/c/t-shirts', '/search', '/robots.txt', '/accounts']) {
      const response = await request(path)
      assert.isNull(response.headers.get('x-robots-tag'), path)
    }
  })
})

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { appUrl } from '#config/storefront'
import { testBrowser } from '#tests/support/browser'
import { world } from '#tests/support/catalog'
import { useJobBoss } from '#tests/support/jobs'
import { setShopStatus } from '#tests/support/shops'
import { act, publishedPlain, publishedTee } from '#tests/support/storefront_products'

/*
 * The storefront product page (docs/08 §2.2, §11.2; ADR-0017 decisions 1,
 * 6 and 8; 01 FR-CAT-012, AC-FR-SRCH-005-4; 02 AC-J02-01, -02, -03, -07;
 * R1-S part 3d-ii-a). The products are made through the real operations.
 *
 * - T-UI-048: `/p/{slug}-{publicId}` renders `storefront/product` with the
 *   product as `getProduct` answers it (the images as URLs, none without a
 *   public store) and the server-rendered HTML names its title, price,
 *   details and canonical URL, and carries the JSON-LD `Product`: an
 *   `Offer` at the default variant's price for a product without axes, an
 *   `AggregateOffer` from the lowest to the highest price for one with
 *   axes, in stock or not as at render time, its text escaped.
 * - T-CAT-004: another slug, no slug, another case or a Crockford alias
 *   answers 301 to the canonical path; a segment with no public ID, an
 *   unknown or overlong one, an unpublished product, or one of a shop not
 *   active is the 404 page.
 * - T-CAT-005 (the product part): the 301 keeps only `variant` and carries
 *   `Cache-Control: public, max-age=86400`.
 * - T-CAT-006 (the product part): the HTML names the canonical URL, without
 *   `variant`, and is not `noindex`.
 */
type ProductProps = {
  product: {
    public_id: string
    title: string
    categories: { slug: string }[]
    media: { alt: string; src: string; srcset: string }[]
    shop: { name: string; return_policy: string }
    delivery: { zone_code: string }[]
  }
  seo: { canonical: string; json_ld: string }
}

async function props(path: string) {
  const browser = testBrowser()
  await browser.open('/')
  return (await browser.props(path)) as unknown as ProductProps
}

const request = (path: string) => testBrowser().request(path, { redirect: 'manual' })

function jsonLdText(html: string) {
  const match = /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/s.exec(html)
  if (!match) throw new Error('no JSON-LD script')
  return match[1]
}

const jsonLd = (html: string) => JSON.parse(jsonLdText(html)) as Record<string, any>

// The rendered markup only: the page's props travel in the HTML too, as JSON.
const markup = (html: string) =>
  html.replaceAll(/<script[\s\S]*?<\/script>/g, '').replaceAll(/data-page="[^"]*"/g, '')

const canonicalOf = (slug: string, publicId: string) => `/p/${slug}-${publicId.toLowerCase()}`

test.group('T-UI-048 the storefront product page', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-UI-048 the page renders the product, its canonical URL and its offer', async ({
    assert,
  }) => {
    const w = await world()
    const made = await publishedPlain(w, { priceMinor: 199900 })
    const path = canonicalOf('organic-cotton-crew-tee', made.publicId)
    const page = await props(path)
    assert.equal(page.product.public_id, made.publicId)
    assert.equal(page.product.title, 'Organic cotton crew tee')
    assert.deepEqual(
      page.product.categories.map((category) => category.slug),
      ['watches', 'analog-watches']
    )
    assert.equal(page.product.shop.return_policy, 'Returns within 7 days, unworn and with tags.')
    assert.deepEqual(
      page.product.delivery.map((zone) => zone.zone_code),
      ['ktm_valley', 'outside_valley']
    )
    assert.equal(page.seo.canonical, `${appUrl}${path}`)

    const response = await request(path)
    const html = await response.text()
    assert.equal(response.status, 200)
    assert.include(html, `<link rel="canonical" href="${appUrl}${path}"`)
    assert.notInclude(html, 'name="robots" content="noindex"')
    assert.match(html, /<h1[^>]*>Organic cotton crew tee<\/h1>/)
    assert.include(markup(html), 'Rs\u00a01,999')
    // FR-CAT-012's details, server-rendered (AC-J02-02).
    for (const text of [
      'Kathmandu Threads Pvt. Ltd.',
      'Wash cold, dry in shade.',
      '1 year',
      'Cash on delivery',
      'Returns within 7 days, unworn and with tags.',
      'The price includes all taxes.',
    ]) {
      assert.include(markup(html), text)
    }
    assert.deepEqual(jsonLd(html), {
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': 'Organic cotton crew tee',
      'description': '180 gsm, pre-shrunk.',
      'url': `${appUrl}${path}`,
      'offers': {
        '@type': 'Offer',
        'price': '1999.00',
        'priceCurrency': 'NPR',
        'availability': 'https://schema.org/InStock',
        'itemCondition': 'https://schema.org/NewCondition',
        'url': `${appUrl}${path}`,
      },
    })
  })

  test('T-UI-048 a product with axes offers its price range; sold out is out of stock', async ({
    assert,
  }) => {
    const w = await world()
    const made = await publishedTee(w)
    const path = canonicalOf('organic-cotton-crew-tee', made.publicId)
    const page = await props(path)
    // No public store in the tests: the images name no URL, but keep their alt text.
    assert.deepEqual(
      page.product.media.map((item) => [item.alt, item.src, item.srcset]),
      [
        ['Organic cotton crew tee', '', ''],
        ['Black tee, back', '', ''],
      ]
    )
    const response = await request(path)
    const html = await response.text()
    assert.include(markup(html), 'Rs\u00a01,299 – Rs\u00a01,399')
    // The variants' prices differ, so no single saving is shown.
    assert.notInclude(markup(html), '% off')
    assert.deepInclude(jsonLd(html).offers, {
      '@type': 'AggregateOffer',
      'lowPrice': '1299.00',
      'highPrice': '1399.00',
      'offerCount': 3,
      'priceCurrency': 'NPR',
      'availability': 'https://schema.org/InStock',
    })
    await db
      .from('inventory_items')
      .whereIn('variant_id', [...made.variants.values()])
      .update({ on_hand: 0, reserved: 0 })
    const soldOut = await request(path)
    const soldOutHtml = await soldOut.text()
    assert.equal(soldOut.status, 200)
    assert.equal(jsonLd(soldOutHtml).offers.availability, 'https://schema.org/OutOfStock')
    assert.include(markup(soldOutHtml), 'Sold out')
  })

  test('T-UI-048 a compare-at price shows the saving, rounded down', async ({ assert }) => {
    const w = await world()
    const made = await publishedPlain(w, { priceMinor: 199900 })
    await db
      .from('product_variants')
      .where('id', made.variants.get('PL')!)
      .update({ compare_at_price_minor: 250000 })
    const page = await request(canonicalOf('organic-cotton-crew-tee', made.publicId))
    const html = await page.text()
    assert.include(markup(html), 'Rs\u00a02,500')
    assert.include(markup(html), '20% off')
  })

  test('T-UI-048 the JSON-LD escapes text that could close the script', async ({ assert }) => {
    const w = await world()
    const description = 'Soft </script><script>alert(1)</script> & light'
    const made = await publishedPlain(w, { description })
    const page = await request(canonicalOf('organic-cotton-crew-tee', made.publicId))
    const html = await page.text()
    assert.notInclude(html, '</script><script>alert(1)')
    // No `<` at all in the script: each one is written \u003c.
    assert.notInclude(jsonLdText(html), '<')
    assert.include(jsonLdText(html), '\\u003c/script\\u003e')
    assert.equal(jsonLd(html).description, description)
  })
})

test.group('T-CAT-004 the product path', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-CAT-004 any other form of the path answers 301 to the canonical one', async ({
    assert,
  }) => {
    const w = await world()
    const made = await publishedPlain(w)
    // A public ID with a 0 and a 1, so the aliases O, I and L stand for them.
    const id = '0A1B0C1D'
    await db.from('products').where('id', made.productId).update({ public_id: id })
    const canonical = canonicalOf('organic-cotton-crew-tee', id)
    for (const path of [
      `/p/old-name-${id}`,
      `/p/${id}`,
      `/p/organic-cotton-crew-tee-${id}`,
      '/p/organic-cotton-crew-tee-OAlBOCID',
      '/p/organic-cotton-crew-tee-oaiboc1d',
    ]) {
      const response = await request(path)
      assert.equal(response.status, 301, path)
      assert.equal(response.headers.get('location'), canonical, path)
    }
  })

  test('T-CAT-004 a path with no public ID, or a product not shown, is the 404 page', async ({
    assert,
  }) => {
    const w = await world()
    const made = await publishedPlain(w)
    const canonical = canonicalOf('organic-cotton-crew-tee', made.publicId)
    for (const path of [
      '/p/abc',
      '/p/tee-ZZZZZZZU',
      `/p/${'a'.repeat(120)}-${made.publicId}`,
      '/p/tee-ZZZZZZZZ',
    ]) {
      const response = await request(path)
      assert.equal(response.status, 404, path)
    }
    await setShopStatus(w.shop.shopId, 'suspended')
    const suspended = await request(canonical)
    assert.equal(suspended.status, 404)
  })

  test('T-CAT-004 an unpublished product is the 404 page', async ({ assert }) => {
    const w = await world()
    const made = await publishedPlain(w)
    const unpublished = await act(w, made.productId, 'unpublish')
    assert.equal(unpublished.status, 200, unpublished.text)
    const response = await request(canonicalOf('organic-cotton-crew-tee', made.publicId))
    assert.equal(response.status, 404)
  })
})

test.group('T-CAT-005 the product redirect keeps only its parameter', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-CAT-005 a 301 keeps only variant and is cached for a day', async ({ assert }) => {
    const w = await world()
    const made = await publishedPlain(w)
    const canonical = canonicalOf('organic-cotton-crew-tee', made.publicId)
    const response = await request(`/p/x-${made.publicId}?variant=abc&utm_source=feed`)
    assert.equal(response.status, 301)
    assert.equal(response.headers.get('location'), `${canonical}?variant=abc`)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=86400')
    const plain = await request(`/p/${made.publicId}`)
    assert.equal(plain.headers.get('location'), canonical)
    assert.equal(plain.headers.get('cache-control'), 'public, max-age=86400')
    // The canonical path itself is served whatever else its query holds.
    const served = await request(`${canonical}?utm_source=feed`)
    assert.equal(served.status, 200)
  })
})

test.group('T-CAT-006 the product page names its URL', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-CAT-006 the server-rendered HTML names the canonical URL and is indexable', async ({
    assert,
  }) => {
    const w = await world()
    const made = await publishedPlain(w)
    const path = canonicalOf('organic-cotton-crew-tee', made.publicId)
    const response = await request(`${path}?variant=abc`)
    const html = await response.text()
    assert.include(html, `<link rel="canonical" href="${appUrl}${path}"`)
    assert.notInclude(html, 'name="robots" content="noindex"')
    assert.equal(jsonLd(html).url, `${appUrl}${path}`)
  })
})

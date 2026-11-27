import { test } from '@japa/runner'
import { appUrl, mediaPublicUrl } from '#config/storefront'
import { testBrowser } from '#tests/support/browser'
import { activeShop, listed, valueId } from '#tests/support/listings'

/*
 * The storefront listing pages (docs/08 §2.2, §11.1; 01 AC-FR-SRCH-001-1 to
 * -4, AC-FR-SRCH-005-2, AC-FR-SRCH-007-1; ADR-0017 decisions 6 and 8; R1-S
 * part 3d-i). The rows are `product_listings` rows written directly.
 *
 * - T-UI-046: `/men`, a navigation entry, `/c/{categorySlug}` and `/search`
 *   render `storefront/listing` with the heading, breadcrumbs, cards (the
 *   product's page path, the image as URLs), page meta and the facets of
 *   the page; an unknown navigation entry or category, or one not listed,
 *   is the 404 page.
 * - T-CAT-005: a parameter the page does not take, or finds invalid, is
 *   dropped with a 301 to the rest in canonical order, `Cache-Control:
 *   public, max-age=86400`; a valid URL in another order is served as it is.
 * - T-CAT-006 (the props part): the canonical link names the unrefined
 *   listing's first page, and a later page of an unrefined listing itself;
 *   `/search`, a page past the last and a refined view with no matches are
 *   `noindex`; the first page of an empty category is not.
 */

type ListingProps = {
  base: {
    kind: string
    path: string
    heading: string
    breadcrumbs: { label: string; href: string }[]
  }
  listing: {
    cards: { title: string; href: string; image: { src: string; srcset: string } }[]
    meta: { page: number; pages: number; total: number; has_more: boolean }
  }
  facets: { code: string }[]
  suggestions: { slug: string }[]
  seo: { canonical: string; noindex: boolean }
}

async function props(path: string) {
  const browser = testBrowser()
  await browser.open('/')
  return (await browser.props(path)) as unknown as ListingProps
}

async function status(path: string) {
  const response = await testBrowser().request(path, { redirect: 'manual' })
  return response
}

const titles = (page: ListingProps) => page.listing.cards.map((card) => card.title).sort()

test.group('T-UI-046 the storefront listing pages', () => {
  test('T-UI-046 an audience page, a navigation entry and a category page', async ({ assert }) => {
    const shop = await activeShop()
    const men = await valueId('audience', 'men')
    const women = await valueId('audience', 'women')
    const made = await listed(shop, { title: 'Men tee', category: 't-shirts', audience: [men] })
    await listed(shop, { title: 'Women tee', category: 't-shirts', audience: [women] })
    await listed(shop, { title: 'Men jeans', category: 'jeans', audience: [men] })

    const menPage = await props('/men')
    assert.equal(menPage.base.heading, 'Men')
    assert.deepEqual(titles(menPage), ['Men jeans', 'Men tee'])
    assert.deepEqual(menPage.base.breadcrumbs, [{ label: 'Men', href: '/men' }])
    // The audience is the page's own, so it is no filter there.
    assert.notInclude(
      menPage.facets.map((facet) => facet.code),
      'audience'
    )
    const card = menPage.listing.cards.find((item) => item.title === 'Men tee')!
    assert.equal(card.href, `/p/${made.slug}-${made.publicId.toLowerCase()}`)
    assert.equal(card.image.src, `${mediaPublicUrl}/p/${made.productId}/abc-320.webp`)
    assert.equal(card.image.srcset, `${mediaPublicUrl}/p/${made.productId}/abc-320.webp 320w`)

    const tees = await props('/men/t-shirts')
    assert.equal(tees.base.heading, "Men's T-shirts")
    assert.deepEqual(titles(tees), ['Men tee'])
    assert.deepEqual(tees.base.breadcrumbs, [
      { label: 'Men', href: '/men' },
      { label: 'T-shirts', href: '/men/t-shirts' },
    ])

    const category = await props('/c/t-shirts')
    assert.equal(category.base.heading, 'T-Shirts')
    assert.deepEqual(titles(category), ['Men tee', 'Women tee'])
    assert.deepEqual(
      category.base.breadcrumbs.map((crumb) => crumb.href),
      ['/c/clothing', '/c/tops', '/c/t-shirts']
    )
    assert.include(
      category.facets.map((facet) => facet.code),
      'audience'
    )
  })

  test('T-UI-046 an unknown navigation entry or category is the 404 page', async ({ assert }) => {
    for (const path of ['/men/unknown', '/c/no-such-category', '/c/T-Shirts', '/kids']) {
      const response = await status(path)
      assert.equal(response.status, 404, path)
    }
  })

  test('T-UI-046 the search page lists the matches; an empty listing suggests categories', async ({
    assert,
  }) => {
    const shop = await activeShop()
    await listed(shop, { title: 'Classic white sneakers', category: 'sneakers' })
    const search = await props('/search?q=sneakers')
    assert.equal(search.base.kind, 'search')
    assert.deepEqual(titles(search), ['Classic white sneakers'])
    const empty = await props('/c/watches')
    assert.equal(empty.listing.meta.total, 0)
    assert.include(
      empty.suggestions.map((item) => item.slug),
      'clothing'
    )
  })
})

test.group('T-CAT-005 the canonical redirect of a listing page', () => {
  test('T-CAT-005 a parameter the page refuses or finds invalid is dropped with a 301', async ({
    assert,
  }) => {
    for (const [from, to] of [
      ['/men?colour=red', '/men'],
      ['/men?audience=women&color=black', '/men?color=black'],
      ['/c/t-shirts?nav=men&page=0', '/c/t-shirts'],
      // A valid navigation entry is still no page parameter: the path carries it.
      ['/c/t-shirts?nav=men', '/c/t-shirts'],
      ['/men/t-shirts?category=jeans&sort=price_asc', '/men/t-shirts?sort=price_asc'],
      ['/search?q=x&color=black', '/search?color=black'],
      ['/men?color=black&apparel_size=m&color=nope', '/men?apparel_size=m'],
    ]) {
      const response = await status(from)
      assert.equal(response.status, 301, from)
      assert.equal(response.headers.get('location'), to, from)
      assert.equal(response.headers.get('cache-control'), 'public, max-age=86400', from)
    }
  })

  test('T-CAT-005 a valid URL in another order is served as it is', async ({ assert }) => {
    const response = await status('/men?sort=price_asc&color=black')
    assert.equal(response.status, 200)
  })
})

test.group('T-CAT-006 the canonical link and robots of a listing page', () => {
  test('T-CAT-006 canonical: the unrefined first page, or a later unrefined page itself', async ({
    assert,
  }) => {
    const shop = await activeShop()
    const men = await valueId('audience', 'men')
    for (let i = 0; i < 3; i++) await listed(shop, { title: `Tee ${i}`, audience: [men] })
    const first = await props('/men')
    assert.deepEqual(first.seo, { canonical: `${appUrl}/men`, noindex: false })
    const second = await props('/men?per_page=2&page=2')
    assert.deepEqual(second.seo, { canonical: `${appUrl}/men`, noindex: false })
    const filtered = await props('/men?color=black')
    assert.equal(filtered.seo.canonical, `${appUrl}/men`)
    // No black tee: a refined view with no matches.
    assert.isTrue(filtered.seo.noindex)
    const past = await props('/men?page=9')
    assert.deepEqual(past.seo, { canonical: `${appUrl}/men?page=9`, noindex: true })
    const later = await props('/men?page=2')
    assert.equal(later.seo.canonical, `${appUrl}/men?page=2`)
  })

  test('T-CAT-006 the server-rendered HTML names the canonical URL and the heading', async ({
    assert,
  }) => {
    const shop = await activeShop()
    const men = await valueId('audience', 'men')
    await listed(shop, { title: 'Server rendered tee', audience: [men] })
    const response = await testBrowser().request('/men?color=black')
    const html = await response.text()
    assert.equal(response.status, 200)
    assert.include(html, `<link rel="canonical" href="${appUrl}/men"`)
    assert.include(html, 'name="robots" content="noindex"')
    assert.match(html, /<h1[^>]*>Men<\/h1>/)
  })

  test('T-CAT-006 the search page is noindex; an empty category first page is not', async ({
    assert,
  }) => {
    const search = await props('/search?q=tee')
    assert.deepEqual(search.seo, { canonical: `${appUrl}/search?q=tee`, noindex: true })
    const empty = await props('/c/watches')
    assert.deepEqual(empty.seo, { canonical: `${appUrl}/c/watches`, noindex: false })
  })
})

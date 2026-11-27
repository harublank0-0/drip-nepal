import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { testBrowser } from '#tests/support/browser'
import { insertBrand } from '#tests/support/catalog'
import { activeShop, listed, valueId } from '#tests/support/listings'

/*
 * The listing's filters, sort and search toolbar (docs/08 §4.3 `FilterBar`,
 * §11.1; 01 AC-FR-SRCH-001-1, -4 and -6; 02 AC-J01-02; R1-S part 3d-i-b).
 * The rows are `product_listings` rows written directly.
 *
 * - T-UI-047: the server-rendered filter panel is a `<form method="get">`
 *   on the page's path whose inputs carry the allowlisted names, with the
 *   URL's filters checked (AC-J01-02), the applied price in hidden paisa
 *   fields, the sort and `/search`'s field tied to it, and an Apply button
 *   for a browser without JavaScript; a page whose path sets the audience
 *   offers none, and only `/search` offers the category; the brand filter
 *   offers the brands of listed products, by name.
 * - T-CAT-110 (partly): on `/search` the query, the category and the
 *   refinements combine, and the category choices stay the same whichever
 *   category is chosen.
 */
type FilterProps = {
  listing: { cards: { title: string }[] }
  facets: { code: string }[]
  brands: { slug: string; name: string }[]
  categories: { slug: string; children: unknown[] }[]
}

async function props(path: string) {
  const browser = testBrowser()
  await browser.open('/')
  return (await browser.props(path)) as unknown as FilterProps
}

async function html(path: string) {
  const response = await testBrowser().request(path)
  return { status: response.status, body: await response.text() }
}

// The attributes of each tag of one kind in the HTML, in any order.
function tags(body: string, kind: string) {
  return [...body.matchAll(new RegExp(`<${kind}\\b([^>]*)>`, 'g'))].map(
    (match) =>
      new Map(
        [...match[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((item) => [item[1], item[2] ?? ''])
      )
  )
}

// Whether the checkbox or radio `name=value` is checked, or null when there is none.
function checked(body: string, name: string, value: string) {
  const found = tags(body, 'input').find(
    (attributes) =>
      ['checkbox', 'radio'].includes(attributes.get('type') ?? '') &&
      attributes.get('name') === name &&
      attributes.get('value') === value
  )
  return found === undefined ? null : found.has('checked')
}

// The first tag of a kind with these attributes, or undefined.
function tag(body: string, kind: string, wanted: Record<string, string>) {
  return tags(body, kind).find((attributes) =>
    Object.entries(wanted).every(([key, value]) => attributes.get(key) === value)
  )
}

// A brand named `prefix …`, its slug from `slugPrefix`, so name and slug order can differ.
async function namedBrand(prefix: string, slugPrefix: string) {
  const id = await insertBrand('active')
  const { slug: random } = await db.from('brands').where('id', id).select('slug').firstOrFail()
  const slug = `${slugPrefix}-${random}`
  const name = `${prefix} ${random}`
  await db.from('brands').where('id', id).update({ name, slug })
  return { id, name, slug }
}

test.group('T-UI-047 the listing filters', () => {
  test('T-UI-047 the filter form names the allowlisted parameters, with the URL checked', async ({
    assert,
  }) => {
    const shop = await activeShop()
    await listed(shop, { title: 'Filter form tee', audience: [await valueId('audience', 'men')] })
    const page = await html(
      '/men?apparel_size=m&in_stock=true&price_max_minor=200050&sort=price_asc'
    )
    assert.equal(page.status, 200)
    assert.isDefined(
      tag(page.body, 'form', { id: 'listing-filters', method: 'get', action: '/men' })
    )
    assert.isTrue(checked(page.body, 'apparel_size', 'm'))
    assert.isFalse(checked(page.body, 'apparel_size', 'l'))
    assert.isTrue(checked(page.body, 'in_stock', 'true'))
    assert.isFalse(checked(page.body, 'color', 'black'))
    // The rupees as typed, and the paisa the form sends.
    assert.isDefined(tag(page.body, 'input', { id: 'listing-filters-price-max', value: '2000.50' }))
    assert.isDefined(
      tag(page.body, 'input', { type: 'hidden', name: 'price_max_minor', value: '200050' })
    )
    assert.notInclude(page.body, 'name="price_min_minor"')
    assert.isDefined(
      tag(page.body, 'select', { id: 'listing-sort', name: 'sort', form: 'listing-filters' })
    )
    assert.isTrue(tag(page.body, 'option', { value: 'price_asc' })?.has('selected'))
    assert.include(page.body, '<noscript><button type="submit"')
    // Every control the form submits is a parameter the page takes: no rupees, no field ids.
    const form = page.body.slice(
      page.body.indexOf('<form id="listing-filters"'),
      page.body.indexOf('</form>', page.body.indexOf('<form id="listing-filters"'))
    )
    const named = [
      ...tags(form, 'input'),
      ...tags(page.body, 'select').filter((item) => item.get('form') === 'listing-filters'),
    ]
      .map((attributes) => attributes.get('name'))
      .filter((name) => name !== undefined)
    const allowed = ['apparel_size', 'shoe_size_eu', 'waist_size_in', 'color', 'brand']
    allowed.push('price_max_minor', 'in_stock', 'sort')
    assert.isNotEmpty(named)
    for (const name of named) assert.include(allowed, name)
    // The path sets the audience, and only /search takes a category.
    assert.isNull(checked(page.body, 'audience', 'men'))
    assert.isNull(checked(page.body, 'category', 'footwear'))
  })

  test('T-UI-047 a category page offers the audience; /search the category and the field', async ({
    assert,
  }) => {
    const category = await html('/c/t-shirts?audience=women')
    assert.isTrue(checked(category.body, 'audience', 'women'))
    assert.isFalse(checked(category.body, 'audience', 'men'))
    assert.isNull(checked(category.body, 'category', 'footwear'))
    assert.notInclude(category.body, 'name="q"')

    const search = await html('/search?q=sneakers&category=footwear')
    assert.isDefined(
      tag(search.body, 'input', {
        id: 'listing-search',
        name: 'q',
        form: 'listing-filters',
        value: 'sneakers',
      })
    )
    assert.isTrue(checked(search.body, 'category', 'footwear'))
    assert.isFalse(checked(search.body, 'category', ''))
    assert.isFalse(checked(search.body, 'category', 'clothing'))
    // The heading and breadcrumb of the search page.
    assert.match(search.body, /<h1[^>]*>Search products<\/h1>/)
    assert.match(search.body, /<span aria-current="page"[^>]*>Search<\/span>/)
    const plain = await html('/search')
    assert.isTrue(checked(plain.body, 'category', ''))
  })

  test('T-UI-047 a URL with a search on a page without the field keeps it in the form', async ({
    assert,
  }) => {
    const page = await html('/men?q=tee&per_page=48')
    assert.isDefined(tag(page.body, 'input', { type: 'hidden', name: 'q', value: 'tee' }))
    assert.isDefined(tag(page.body, 'input', { type: 'hidden', name: 'per_page', value: '48' }))
  })

  test('T-UI-047 the brand filter offers the brands of listed products, by name', async ({
    assert,
  }) => {
    const shop = await activeShop()
    // By name, not by slug: Alpha's slug sorts after Zeta's.
    const zeta = await namedBrand('Zeta', 'a')
    const alpha = await namedBrand('Alpha', 'z')
    const unlisted = await namedBrand('Beta', 'b')
    await listed(shop, { title: 'Zeta tee', brand: zeta })
    await listed(shop, { title: 'Alpha tee', brand: alpha })
    await listed(shop, { title: 'Own label tee', brand: null })
    const page = await props('/c/t-shirts')
    const slugs = page.brands.map((brand) => brand.slug)
    assert.deepEqual(slugs, [alpha.slug, zeta.slug])
    assert.notInclude(slugs, unlisted.slug)
    const form = await html(`/c/t-shirts?brand=${zeta.slug}`)
    assert.isTrue(checked(form.body, 'brand', zeta.slug))
    assert.isFalse(checked(form.body, 'brand', alpha.slug))
    // The page's own scope: a brand listed only in footwear is not offered on t-shirts,
    // unless the URL selects it.
    const shoes = await namedBrand('Shoe', 'c')
    await listed(shop, { title: 'Brand sneakers', category: 'sneakers', brand: shoes })
    const tees = await props('/c/t-shirts')
    assert.notInclude(
      tees.brands.map((brand) => brand.slug),
      shoes.slug
    )
    const footwear = await props('/c/footwear')
    assert.include(
      footwear.brands.map((brand) => brand.slug),
      shoes.slug
    )
    const selected = await props(`/c/t-shirts?brand=${shoes.slug}`)
    assert.include(
      selected.brands.map((brand) => brand.name),
      shoes.name
    )
  })
})

test.group('T-CAT-110 search, category and refinements', () => {
  test('T-CAT-110 the query, the category and a refinement combine', async ({ assert }) => {
    const shop = await activeShop()
    const black = await valueId('color', 'black')
    await listed(shop, { title: 'Black canvas sneakers', category: 'sneakers', colors: [black] })
    await listed(shop, { title: 'White canvas sneakers', category: 'sneakers' })
    await listed(shop, { title: 'Black canvas tee', category: 't-shirts', colors: [black] })
    const page = await props('/search?q=canvas&category=footwear&color=black')
    assert.deepEqual(
      page.listing.cards.map((card) => card.title),
      ['Black canvas sneakers']
    )
  })

  test('T-CAT-110 the category choices stay the same whichever category is chosen', async ({
    assert,
  }) => {
    const all = await props('/search?q=canvas')
    const chosen = await props('/search?q=canvas&category=footwear')
    const roots = all.categories.map((node) => node.slug)
    assert.includeMembers(roots, ['clothing', 'footwear', 'bags'])
    assert.deepEqual(
      chosen.categories.map((node) => node.slug),
      roots
    )
    const men = await props('/men')
    assert.deepEqual(men.categories, [])
    // A value selected before the category changed keeps its group, so it can be read and unticked.
    const tees = await props('/search?q=canvas&category=t-shirts')
    const kept = await props('/search?q=canvas&category=t-shirts&shoe_size_eu=42')
    const codes = (page: FilterProps) => page.facets.map((facet) => facet.code)
    assert.notInclude(codes(tees), 'shoe_size_eu')
    assert.include(codes(kept), 'shoe_size_eu')
  })
})

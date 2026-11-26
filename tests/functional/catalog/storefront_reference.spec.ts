import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { NAVIGATION, navigationEntry } from '#modules/catalog/navigation'
import { listedCategoryPath } from '#modules/catalog/queries'
import { clientNetwork, rateLimiter, rateLimitKey } from '#modules/platform/rate_limits'
import { testBrowser } from '#tests/support/browser'
import { signIn } from '#tests/support/courier_http'
import { forgetKeys, getJson, randomIPv4, type Guest } from '#tests/support/identity'

/*
 * The storefront's reference reads and navigation entries (docs/06 §13.2
 * `listCategories`, `listAttributes`; docs/04 §3.12; R1-S part 3a), on the
 * seeded reference data:
 * - T-CAT-015: the active category tree as `{id, slug, name, children}`,
 *   siblings by `position` (the seeded order) then name, leaving out an inactive category and
 *   everything under an inactive parent; the filterable attributes with
 *   their active values and swatches, all of them or those of a category,
 *   its ancestors and its listed descendants; an unknown, inactive or hidden category answers
 *   an empty list; open to a guest and to a signed-in user; 400
 *   `INVALID_QUERY_PARAMETER` for an unknown, repeated or malformed
 *   parameter. Test rows use slugs and codes the seed does not have,
 *   inserted in the test's transaction.
 * - T-CAT-107: every navigation entry names an active `audience` value and,
 *   below the audience pages, a listed category; paths are unique and of
 *   their shape; a path outside the list has no entry.
 * Each call charges `catalog_ip` on the client network (06 §9.1), which the
 * limiter store commits on its own connection, so each test sends its own
 * network as `X-Forwarded-For` and deletes its keys (docs/10 §3.3).
 */

const CATEGORIES = '/api/v1/catalog/categories'
const ATTRIBUTES = '/api/v1/catalog/attributes'

const networks: string[] = []

async function forgetNetworks() {
  for (const network of networks.splice(0)) await forgetKeys('catalog_ip', network)
}

function visitor(): Guest {
  const ip = randomIPv4()
  networks.push(clientNetwork(ip))
  return { browser: testBrowser(), ip }
}

type Node = { id: string; slug: string; name: string; children: Node[] }

const slugsOf = (nodes: Node[]) => nodes.map((node) => node.slug)
const childrenOf = (nodes: Node[], slug: string) =>
  nodes.find((node) => node.slug === slug)!.children
const codesOf = (body: { data: { code: string }[] }) => body.data.map((item) => item.code)

async function insertCategory(
  parent: { id: string; path: string; depth: number } | null,
  active: boolean
) {
  const slug = `test-${randomUUID().slice(0, 8)}`
  const [row] = await db
    .table('categories')
    .insert({
      parent_id: parent?.id ?? null,
      slug,
      name: `Test ${slug.slice(-8)}`,
      path: `${parent?.path ?? '/'}${slug}/`,
      depth: (parent?.depth ?? 0) + 1,
      is_active: active,
    })
    .returning(['id', 'path', 'depth'])
  return { ...row, slug } as { id: string; path: string; depth: number; slug: string }
}

const category = (slug: string) =>
  db.from('categories').where('slug', slug).select('id', 'path', 'depth').firstOrFail()

test.group('T-CAT-015 the category tree and the filterable attributes', (group) => {
  group.each.teardown(forgetNetworks)

  test('T-CAT-015 listCategories answers the active tree, siblings in their seeded order', async ({
    assert,
  }) => {
    const response = await getJson(visitor(), CATEGORIES)
    assert.equal(response.status, 200, response.text)
    const tree = response.body.data as Node[]
    assert.deepEqual(slugsOf(tree), [
      'clothing',
      'traditional-wear',
      'footwear',
      'bags',
      'watches',
      'accessories',
    ])
    assert.deepEqual(slugsOf(childrenOf(tree, 'clothing')), [
      'tops',
      'bottoms',
      'dresses-jumpsuits',
      'activewear',
      'innerwear-sleepwear',
    ])
    assert.deepEqual(slugsOf(childrenOf(childrenOf(tree, 'clothing'), 'tops')), [
      't-shirts',
      'shirts',
      'polo-shirts',
      'hoodies-sweatshirts',
      'sweaters-cardigans',
      'jackets',
      'tops-blouses',
    ])
    const tshirts = childrenOf(childrenOf(tree, 'clothing'), 'tops').find(
      (node) => node.slug === 't-shirts'
    )!
    const seeded = await category('t-shirts')
    assert.deepEqual(tshirts, { id: seeded.id, slug: 't-shirts', name: 'T-Shirts', children: [] })
    // A body without `meta`: the list is bounded (06 §6.2).
    assert.deepEqual(Object.keys(response.body), ['data'])
  })

  test('T-CAT-015 an inactive category and everything under an inactive parent are left out', async ({
    assert,
  }) => {
    const tops = await category('tops')
    const hiddenLeaf = await insertCategory(tops, false)
    const hiddenRoot = await insertCategory(null, false)
    const orphan = await insertCategory(hiddenRoot, true)
    const visibleRoot = await insertCategory(null, true)
    const response = await getJson(visitor(), CATEGORIES)
    assert.equal(response.status, 200, response.text)
    const tree = response.body.data as Node[]
    const all = JSON.stringify(tree)
    assert.notInclude(all, hiddenLeaf.slug)
    assert.notInclude(all, hiddenRoot.slug)
    assert.notInclude(all, orphan.slug)
    assert.include(slugsOf(tree), visibleRoot.slug)
    assert.isNull(await listedCategoryPath(orphan.slug))
    assert.equal(await listedCategoryPath(visibleRoot.slug), visibleRoot.path)
  })

  test('T-CAT-015 siblings of one position come by name, values of one position by label then code', async ({
    assert,
  }) => {
    const root = await insertCategory(null, true)
    for (const name of ['Test zeta', 'Test alpha']) {
      const slug = `test-${randomUUID().slice(0, 8)}`
      await db
        .table('categories')
        .insert({ parent_id: root.id, slug, name, path: `${root.path}${slug}/`, depth: 2 })
    }
    const tree = await getJson(visitor(), CATEGORIES)
    const children = childrenOf(tree.body.data as Node[], root.slug)
    assert.deepEqual(
      children.map((node) => node.name),
      ['Test alpha', 'Test zeta']
    )

    const code = `test_tie_${randomUUID().slice(0, 6)}`
    const [attribute] = await db
      .table('attributes')
      .insert({
        code,
        name: 'Test tie',
        scope: 'product',
        input: 'multi',
        is_filterable: true,
        position: 99,
      })
      .returning('id')
    await db.table('attribute_values').multiInsert([
      { attribute_id: attribute.id, code: 'c', label: 'Beta' },
      { attribute_id: attribute.id, code: 'z', label: 'Alpha' },
      { attribute_id: attribute.id, code: 'a', label: 'Beta' },
    ])
    const response = await getJson(visitor(), ATTRIBUTES)
    const tie = response.body.data.find((item: { code: string }) => item.code === code)
    assert.deepEqual(codesOf({ data: tie.values }), ['z', 'a', 'c'])
  })

  test('T-CAT-015 listAttributes answers every filterable attribute with its active values', async ({
    assert,
  }) => {
    const color = await db.from('attributes').where('code', 'color').select('id').firstOrFail()
    const hidden = `test-hue-${randomUUID().slice(0, 6)}`
    await db
      .table('attribute_values')
      .insert({ attribute_id: color.id, code: hidden, label: 'Test hue', is_active: false })
    const response = await getJson(visitor(), ATTRIBUTES)
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(codesOf(response.body), [
      'audience',
      'apparel_size',
      'shoe_size_eu',
      'waist_size_in',
      'color',
    ])
    const [audience] = response.body.data
    assert.deepEqual(audience, {
      code: 'audience',
      name: 'Audience',
      input: 'multi',
      values: [
        { code: 'men', label: 'Men', swatch_hex: null },
        { code: 'women', label: 'Women', swatch_hex: null },
        { code: 'kids', label: 'Kids', swatch_hex: null },
      ],
    })
    const colours = response.body.data.at(-1)
    assert.deepInclude(colours.values[0], { code: 'black', label: 'Black', swatch_hex: '#111111' })
    assert.notInclude(codesOf({ data: colours.values }), hidden)
  })

  test('T-CAT-015 with a category, the filters of its ancestors and its listed subtree', async ({
    assert,
  }) => {
    const tshirts = await getJson(visitor(), `${ATTRIBUTES}?category=t-shirts`)
    assert.equal(tshirts.status, 200, tshirts.text)
    assert.deepEqual(codesOf(tshirts.body), ['audience', 'apparel_size', 'color'])
    const footwear = await getJson(visitor(), `${ATTRIBUTES}?category=footwear`)
    assert.deepEqual(codesOf(footwear.body), ['audience', 'shoe_size_eu', 'color'])
    // A parent offers the sizes its leaves vary by: its listing shows the whole subtree.
    const clothing = await getJson(visitor(), `${ATTRIBUTES}?category=clothing`)
    assert.deepEqual(codesOf(clothing.body), ['audience', 'apparel_size', 'waist_size_in', 'color'])
    const accessories = await getJson(visitor(), `${ATTRIBUTES}?category=accessories`)
    assert.deepEqual(codesOf(accessories.body), ['audience', 'apparel_size', 'color'])
    // A rule on a hidden category adds no filter to its parent.
    const shoeSize = await db
      .from('attributes')
      .where('code', 'shoe_size_eu')
      .select('id')
      .firstOrFail()
    const bags = await category('bags')
    const hiddenBag = await insertCategory(bags, false)
    const hiddenRoot = await insertCategory(null, false)
    const underHidden = await insertCategory(hiddenRoot, true)
    for (const hidden of [hiddenBag, underHidden]) {
      await db
        .table('category_attributes')
        .insert({ category_id: hidden.id, attribute_id: shoeSize.id, usage: 'variant_axis' })
    }
    const bagFilters = await getJson(visitor(), `${ATTRIBUTES}?category=bags`)
    assert.deepEqual(codesOf(bagFilters.body), ['audience', 'color'])

    const orphan = await insertCategory(hiddenRoot, true)
    for (const slug of ['no-such-category', hiddenRoot.slug, orphan.slug]) {
      const empty = await getJson(visitor(), `${ATTRIBUTES}?category=${slug}`)
      assert.equal(empty.status, 200, slug)
      assert.deepEqual(empty.body, { data: [] }, slug)
    }
  })

  test('T-CAT-015 open to a signed-in user too; each call takes a catalog_ip point', async ({
    assert,
  }) => {
    const user = await UserFactory.create()
    const browser = await signIn(user.id)
    const ip = randomIPv4()
    networks.push(clientNetwork(ip))
    const limiter = rateLimiter('catalog_ip')
    const key = rateLimitKey('catalog_ip', clientNetwork(ip))
    const categories = await getJson({ browser, ip }, CATEGORIES)
    assert.equal(categories.status, 200, categories.text)
    const attributes = await getJson({ browser, ip }, ATTRIBUTES)
    assert.equal(attributes.status, 200, attributes.text)
    const charged = await limiter.get(key)
    assert.equal(charged?.consumed, 2, 'both reads are charged to the client network')
    // Instead of `api_user` (06 §9.1).
    const perUser = await rateLimiter('api_user').get(rateLimitKey('api_user', String(user.id)))
    assert.isNull(perUser)
  })

  test('T-CAT-015 an unknown, repeated or malformed parameter is 400', async ({ assert }) => {
    for (const path of [
      `${CATEGORIES}?depth=1`,
      `${ATTRIBUTES}?shop=demo`,
      `${ATTRIBUTES}?category=tops&category=bottoms`,
      `${ATTRIBUTES}?category=Tops`,
      `${ATTRIBUTES}?category=a`,
      `${ATTRIBUTES}?category=`,
    ]) {
      const response = await getJson(visitor(), path)
      assert.equal(response.status, 400, path)
      assert.equal(response.body.code, 'INVALID_QUERY_PARAMETER', path)
    }
  })
})

test.group('T-CAT-107 navigation entries', () => {
  test('T-CAT-107 every entry names an active audience value and a listed category', async ({
    assert,
  }) => {
    const audiences = await db
      .from('attribute_values as v')
      .join('attributes as a', 'a.id', 'v.attribute_id')
      .where({ 'a.code': 'audience', 'v.is_active': true })
      .select('v.code')
    const codes = new Set(audiences.map((row) => row.code as string))
    for (const entry of NAVIGATION) {
      assert.isTrue(codes.has(entry.audience), `${entry.path}: audience ${entry.audience}`)
      assert.match(entry.path, /^\/[a-z]+(\/[a-z0-9]+(-[a-z0-9]+)*)?$/, entry.path)
      assert.isTrue(entry.path.startsWith(`/${entry.audience}`), entry.path)
      if (entry.categorySlug === null) {
        assert.equal(entry.path, `/${entry.audience}`)
        continue
      }
      assert.isString(await listedCategoryPath(entry.categorySlug), entry.path)
    }
    assert.equal(new Set(NAVIGATION.map((entry) => entry.path)).size, NAVIGATION.length)
  })

  test('T-CAT-107 a path outside the list has no entry', ({ assert }) => {
    assert.deepEqual(navigationEntry('/men/t-shirts'), {
      path: '/men/t-shirts',
      label: 'T-shirts',
      title: "Men's T-shirts",
      audience: 'men',
      categorySlug: 't-shirts',
    })
    assert.deepInclude(navigationEntry('/women/tops'), { label: 'Tops', categorySlug: 'tops' })
    assert.deepInclude(navigationEntry('/men'), { label: 'Men', title: 'Men', categorySlug: null })
    for (const path of ['/men/unknown', '/men/t-shirts/', '/kids', '/Men', '/men/t-shirts/extra']) {
      assert.isNull(navigationEntry(path), path)
    }
  })
})

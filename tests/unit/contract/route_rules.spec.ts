import { test } from '@japa/runner'
import { join } from 'node:path'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * The route-table rules of scripts/check_routes.mjs, on saved route lists
 * in the `node ace list:routes --json` shape. CI's Contract stage runs the
 * script on the real development and production route lists.
 * - T-SEC-005: every `{shopSlug}` seller route has `sellerContext`, and no
 *   other route does.
 * - T-SEC-037: `auth` runs before `sellerContext`.
 * - T-UI-025: `guest` only on the sign-in, sign-up and reset pages and
 *   `logIn`, so no storefront route uses it.
 * - T-UI-026: the production list has no development route, and every
 *   development-only route sits under `/dev` with a `dev.*` name.
 */

type Route = { name?: string; pattern: string; methods?: string[]; middleware?: string[] }

const json = (routes: Route[]) =>
  JSON.stringify([
    {
      domain: 'root',
      routes: routes.map((route) => ({
        name: route.name ?? '',
        pattern: route.pattern,
        methods: route.methods ?? ['GET', 'HEAD'],
        handler: { type: 'closure', name: 'closure' },
        middleware: (route.middleware ?? []).map((name) => ({
          type: 'named',
          name,
          moduleNameOrPath: `#middleware/${name}`,
          method: 'handle',
        })),
      })),
    },
  ])

// Routes that pass every rule; each case adds or changes one.
const HOME = { name: 'home', pattern: '/' }
const SELLER_PAGE = {
  name: 'seller.dashboard',
  pattern: '/seller/:shopSlug',
  middleware: ['auth', 'sellerContext'],
}
const SELLER_API = {
  name: 'getSellerShop',
  pattern: '/api/v1/seller/shops/:shopSlug',
  middleware: ['auth', 'sellerContext'],
}
const LOGIN_PAGE = { name: 'login', pattern: '/login', middleware: ['guest'] }
const LOG_IN = {
  name: 'logIn',
  pattern: '/api/v1/auth/session',
  methods: ['POST'],
  middleware: ['guest'],
}
const GALLERY = { name: 'dev.design_system', pattern: '/dev/design-system' }
const PRODUCTION = [HOME, SELLER_PAGE, SELLER_API, LOGIN_PAGE, LOG_IN]
const DEVELOPMENT = [...PRODUCTION, GALLERY]

async function check(development: Route[], production: Route[] = PRODUCTION) {
  const tree = await fixtureTree({
    'development.json': json(development),
    'production.json': json(production),
  })
  try {
    return await runScript('check_routes.mjs', [
      '--routes',
      join(tree.root, 'development.json'),
      '--production-routes',
      join(tree.root, 'production.json'),
    ])
  } finally {
    await tree.cleanup()
  }
}

const without = (routes: Route[], route: Route) => routes.filter((r) => r !== route)

test.group('Route rules: the script', (group) => {
  group.each.timeout(30_000)

  test('T-SEC-005, T-SEC-037, T-UI-025 and T-UI-026 route lists that keep every rule pass', async ({
    assert,
  }) => {
    const result = await check(DEVELOPMENT)
    assert.equal(result.code, 0, result.stderr)
    assert.include(result.stdout, '6 route(s) checked')
  })

  test('T-UI-026 one route list without the other is a usage error', async ({ assert }) => {
    const result = await runScript('check_routes.mjs', ['--routes', 'development.json'])
    assert.equal(result.code, 2)
  })
})

test.group('T-SEC-005 every {shopSlug} seller route has seller_context', (group) => {
  group.each.timeout(30_000)

  test('T-SEC-005 {label} fails')
    .with([
      {
        label: 'a seller page without sellerContext',
        route: { pattern: '/seller/:shopSlug/products', middleware: ['auth'] },
      },
      {
        label: 'a seller API route without sellerContext',
        route: { pattern: '/api/v1/seller/shops/:shopSlug/orders', middleware: ['auth'] },
      },
      {
        label: 'sellerContext on a storefront shop page',
        route: { pattern: '/shops/:shopSlug', middleware: ['auth', 'sellerContext'] },
      },
      {
        label: 'a seller page whose shop segment has another name',
        route: { pattern: '/seller/:slug/products', middleware: ['auth'] },
      },
      {
        label: 'a seller API route with an optional shop segment',
        route: { pattern: '/api/v1/seller/shops/:shopSlug?', middleware: ['auth'] },
      },
      {
        label: 'a HEAD-only seller route without sellerContext',
        route: { pattern: '/seller/:shopSlug/export', methods: ['HEAD'], middleware: ['auth'] },
      },
    ])
    .run(async ({ assert }, row: { label: string; route: Route }) => {
      const result = await check([...DEVELOPMENT, row.route], [...PRODUCTION, row.route])
      const method = row.route.methods?.join(',') === 'HEAD' ? 'HEAD' : 'GET'
      assert.equal(result.code, 1)
      assert.include(result.stderr, `T-SEC-005 ${method} ${row.route.pattern}`)
    })

  test('T-SEC-005 {label} fails even with sellerContext')
    .with([
      { label: 'a shop segment with another name', pattern: '/seller/:slug/products' },
      { label: 'an optional shop segment', pattern: '/api/v1/seller/shops/:shopSlug?' },
      { label: 'a fixed shop segment', pattern: '/seller/new' },
    ])
    .run(async ({ assert }, row: { label: string; pattern: string }) => {
      const route = { pattern: row.pattern, middleware: ['auth', 'sellerContext'] }
      const result = await check([...DEVELOPMENT, route], [...PRODUCTION, route])
      assert.equal(result.code, 1)
      assert.include(
        result.stderr,
        `T-SEC-005 GET ${row.pattern}: a seller route whose shop segment`
      )
    })

  test('T-SEC-005 the shop list outside a shop needs no sellerContext', async ({ assert }) => {
    const listMyShops = {
      name: 'listMyShops',
      pattern: '/api/v1/seller/shops',
      middleware: ['auth'],
    }
    const result = await check([...DEVELOPMENT, listMyShops], [...PRODUCTION, listMyShops])
    assert.equal(result.code, 0, result.stderr)
  })
})

test.group('T-SEC-037 seller routes run auth before seller_context', (group) => {
  group.each.timeout(30_000)

  test('T-SEC-037 {label} fails')
    .with([
      { label: 'sellerContext before auth', middleware: ['sellerContext', 'auth'] },
      { label: 'sellerContext without auth', middleware: ['sellerContext'] },
    ])
    .run(async ({ assert }, row: { label: string; middleware: string[] }) => {
      const route = { pattern: '/seller/:shopSlug/orders', middleware: row.middleware }
      const result = await check([...DEVELOPMENT, route], [...PRODUCTION, route])
      assert.equal(result.code, 1)
      assert.include(result.stderr, 'T-SEC-037 GET /seller/:shopSlug/orders')
    })
})

test.group('T-UI-025 no storefront route uses guest()', (group) => {
  group.each.timeout(30_000)

  test('T-UI-025 {label} fails')
    .with([
      { label: 'guest on the home page', route: { pattern: '/', middleware: ['guest'] } },
      {
        label: 'guest on a product page',
        route: { pattern: '/p/:productSlug', middleware: ['guest'] },
      },
      {
        label: 'guest on a write to a sign-in page path',
        route: { pattern: '/login', methods: ['POST'], middleware: ['guest'] },
      },
      {
        label: 'guest on a HEAD-only route',
        route: { pattern: '/p/:productSlug', methods: ['HEAD'], middleware: ['guest'] },
      },
    ])
    .run(async ({ assert }, row: { label: string; route: Route }) => {
      const result = await check([...DEVELOPMENT, row.route], [...PRODUCTION, row.route])
      assert.equal(result.code, 1)
      assert.include(result.stderr, 'T-UI-025')
    })

  test('T-UI-025 guest on the sign-in, sign-up and reset pages and logIn passes', async ({
    assert,
  }) => {
    const pages = ['/signup', '/forgot-password', '/reset-password'].map((pattern) => ({
      pattern,
      middleware: ['guest'],
    }))
    const result = await check([...DEVELOPMENT, ...pages], [...PRODUCTION, ...pages])
    assert.equal(result.code, 0, result.stderr)
  })
})

test.group('T-UI-026 the production route list has no development routes', (group) => {
  group.each.timeout(30_000)

  test('T-UI-026 {label} fails')
    .with([
      { label: 'the gallery listed in production', production: [...PRODUCTION, GALLERY] },
      {
        label: 'a dev.* name in production',
        production: [...PRODUCTION, { name: 'dev.mail_preview', pattern: '/mail-preview' }],
      },
      {
        label: 'a HEAD-only development route in production',
        production: [...PRODUCTION, { name: 'dev.ping', pattern: '/dev/ping', methods: ['HEAD'] }],
      },
    ])
    .run(async ({ assert }, row: { label: string; production: Route[] }) => {
      const result = await check(DEVELOPMENT, row.production)
      assert.equal(result.code, 1)
      assert.include(result.stderr, 'T-UI-026')
      assert.include(result.stderr, 'in the production route list')
    })

  test('T-UI-026 {label} fails')
    .with([
      {
        label: 'a development-only route outside /dev',
        route: { name: 'dev.mock_checkout', pattern: '/mock/checkout' },
      },
      {
        label: 'a development-only route without a dev.* name',
        route: { name: 'mock_checkout', pattern: '/dev/mock-checkout' },
      },
    ])
    .run(async ({ assert }, row: { label: string; route: Route }) => {
      const result = await check([...DEVELOPMENT, row.route])
      assert.equal(result.code, 1)
      assert.include(result.stderr, 'T-UI-026')
      assert.include(result.stderr, 'belongs under /dev')
    })

  test('T-UI-026 a production route missing from development still passes', async ({ assert }) => {
    const result = await check(without(DEVELOPMENT, GALLERY), PRODUCTION)
    assert.equal(result.code, 0, result.stderr)
  })
})

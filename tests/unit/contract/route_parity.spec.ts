import { test } from '@japa/runner'
import { join } from 'node:path'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * T-API-010: route parity between the `/api/v1` routes (`node ace
 * list:routes --json`) and docs/openapi.yaml `paths` ∪ `x-pending-operations`
 * (docs/09 §4.5). Operations of `x-foundation-scope` may be specified
 * before their route exists; every other operation in `paths` needs one.
 */

const SPEC = `openapi: 3.1.0
x-foundation-scope:
  - listProducts
x-pending-operations:
  - getProduct
  - signUp
paths:
  /api/v1/catalog/products:
    get:
      operationId: listProducts
  /api/v1/seller/shops/{shopSlug}/products:
    post:
      operationId: createProduct
      responses:
        '201':
          description: Created
components:
  schemas: {}
`

const route = (pattern: string, methods: string[], name: string | null) => ({
  name,
  pattern,
  methods,
  handler: { type: 'controller', name: 'x' },
  middleware: [],
})

async function check(routes: object[], spec = SPEC) {
  const tree = await fixtureTree({
    'openapi.yaml': spec,
    'routes.json': JSON.stringify([{ domain: 'root', routes }]),
  })
  try {
    return await runScript('check_api_contract.mjs', [
      '--spec',
      join(tree.root, 'openapi.yaml'),
      '--routes',
      join(tree.root, 'routes.json'),
    ])
  } finally {
    await tree.cleanup()
  }
}

const CREATE = route('/api/v1/seller/shops/:shopSlug/products', ['POST'], 'createProduct')

test.group('T-API-010 route parity', (group) => {
  group.each.timeout(30_000)

  test('T-API-010 the repository passes', async ({ assert }) => {
    const result = await runScript('check_api_contract.mjs')
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /route\(s\) match their operations/)
  })

  test('T-API-010 matching routes pass; a foundation operation may wait for its route', async ({
    assert,
  }) => {
    const result = await check([CREATE, route('/', ['GET', 'HEAD'], 'home')])
    assert.equal(result.code, 0, result.stderr)
    assert.include(result.stdout, 'specified, not built yet: listProducts')
  })

  test('T-API-010 fails on {case}')
    .with([
      {
        case: 'a route without an operation',
        routes: [CREATE, route('/api/v1/me', ['GET'], 'getMe')],
        spec: SPEC,
        expected: 'GET /api/v1/me: no operation',
      },
      {
        case: 'a route name that is not the operationId',
        routes: [{ ...CREATE, name: 'products.store' }],
        spec: SPEC,
        expected: 'the route name is products.store, the operationId is createProduct',
      },
      {
        case: 'an operation outside the foundation scope without a route',
        routes: [],
        spec: SPEC,
        expected: 'createProduct: an operation in paths has no route',
      },
      {
        case: 'a pending operation that has a path',
        routes: [CREATE],
        spec: SPEC.replace('  - signUp\n', '  - signUp\n  - createProduct\n'),
        expected: 'createProduct is in x-pending-operations but has a path',
      },
    ])
    .run(async ({ assert }, { routes, spec, expected }) => {
      const result = await check(routes, spec)
      assert.equal(result.code, 1)
      assert.include(result.stderr, expected)
    })
})

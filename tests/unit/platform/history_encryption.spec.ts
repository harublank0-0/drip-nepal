import { test } from '@japa/runner'
import { encryptsHistory } from '#config/inertia'

/*
 * T-SEC-043, the path rule (docs/07 §3.11): a surface counts as a whole
 * first path segment, the exact path included. The functional test covers
 * the rendered pages.
 */
test.group('T-SEC-043 which paths encrypt their history', () => {
  test('T-SEC-043 {path}: {expected}')
    .with([
      { path: '/account', expected: true },
      { path: '/account/', expected: true },
      { path: '/account/orders/42', expected: true },
      { path: '/sell', expected: true },
      { path: '/invitations/abc', expected: true },
      { path: '/seller/thulo-pasal/products', expected: true },
      { path: '/admin', expected: true },
      { path: '/checkout', expected: true },
      { path: '/accounts', expected: false },
      { path: '/selling', expected: false },
      { path: '/sellers', expected: false },
      { path: '/', expected: false },
      { path: '/products/t-shirt', expected: false },
      { path: '/cart', expected: false },
      { path: '/Account', expected: false },
    ])
    .run(({ assert }, { path, expected }) => {
      assert.equal(encryptsHistory(path), expected)
    })
})

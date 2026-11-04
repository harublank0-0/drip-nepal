import { test } from '@japa/runner'
import { safeReturnPath } from '#modules/auth/return_path'

/*
 * Where the login page may send someone back to (`?next=`, and the page
 * the auth middleware remembers). Only a path on this site counts: a
 * browser resolves `//host`, `/\host` and paths with tabs or newlines in
 * them against another host, so those are refused outright.
 */

test.group('Return path after login', () => {
  test('{$self} is kept as {expected}')
    .with([
      { $self: '/track-order', expected: '/track-order' },
      { $self: '/checkout?step=2', expected: '/checkout?step=2' },
      { $self: '/products/linen-kurta#reviews', expected: '/products/linen-kurta' },
      { $self: '/%5Cevil.example', expected: '/%5Cevil.example' },
    ])
    .run(({ assert }, row) => {
      assert.equal(safeReturnPath(row.$self), row.expected)
    })

  test('{$self} is refused')
    .with([
      { $self: '//evil.example/login' },
      { $self: '/\\evil.example/login' },
      { $self: '/\t/evil.example' },
      { $self: '/\n/evil.example' },
      { $self: 'https://evil.example/' },
      { $self: 'evil.example' },
      { $self: '/api/v1/checkout' },
      { $self: '' },
    ])
    .run(({ assert }, row) => {
      assert.isNull(safeReturnPath(row.$self))
    })

  test('a value that is not a string is refused', ({ assert }) => {
    assert.isNull(safeReturnPath(undefined))
    assert.isNull(safeReturnPath(['/checkout']))
  })
})

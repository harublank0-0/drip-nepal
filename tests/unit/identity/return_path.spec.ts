import { test } from '@japa/runner'
import { MAX_RETURN_PATH_LENGTH, safeReturnPath } from '#modules/identity/domain/return_path'

/*
 * T-SEC-017: where `logIn` may send someone back to (`return_to`, docs/07
 * TM-14). Only a path on this site counts: a browser resolves `//host`,
 * `/\host` and paths with tabs or newlines in them against another host,
 * so those are refused outright, as are dot segments that resolve to
 * `//host`. The HTTP cases are in tests/functional/identity/log_in.spec.ts.
 */

test.group('T-SEC-017 return path after login', () => {
  test('T-SEC-017 {$self} is kept as {expected}')
    .with([
      { $self: '/track-order', expected: '/track-order' },
      { $self: '/checkout?step=2', expected: '/checkout?step=2' },
      { $self: '/products/linen-kurta#reviews', expected: '/products/linen-kurta' },
      { $self: '/%5Cevil.example', expected: '/%5Cevil.example' },
      // Percent-encoded, a tab is only text in the path: it stays on this site.
      { $self: '/%09/evil.example', expected: '/%09/evil.example' },
    ])
    .run(({ assert }, row) => {
      assert.equal(safeReturnPath(row.$self), row.expected)
    })

  test('T-SEC-017 {$self} is refused')
    .with([
      { $self: '//evil.example/login' },
      { $self: '/\\evil.example/login' },
      { $self: '/\t/evil.example' },
      { $self: '/\n/evil.example' },
      { $self: '/\r\n/evil.example' },
      { $self: 'https://evil.example/' },
      { $self: 'https:evil.example' },
      { $self: 'evil.example' },
      { $self: '/api/v1/checkout' },
      { $self: '/..//evil.example' },
      { $self: '/.//evil.example' },
      { $self: '/x/..//evil.example' },
      { $self: '/%2e//evil.example' },
      { $self: '/%2e%2e//evil.example' },
      { $self: '' },
    ])
    .run(({ assert }, row) => {
      assert.isNull(safeReturnPath(row.$self))
    })

  test('T-SEC-017 a path longer than 2,048 characters is refused; one of 2,048 is kept', ({
    assert,
  }) => {
    assert.equal(MAX_RETURN_PATH_LENGTH, 2048)
    const longest = `/${'a'.repeat(2047)}`
    assert.equal(safeReturnPath(longest), longest)
    assert.isNull(safeReturnPath(`/${'a'.repeat(2048)}`))
  })

  test('T-SEC-017 a value that is not a string is refused', ({ assert }) => {
    assert.isNull(safeReturnPath(undefined))
    assert.isNull(safeReturnPath(['/checkout']))
  })
})

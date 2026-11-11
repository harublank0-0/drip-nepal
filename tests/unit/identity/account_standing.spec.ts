import { test } from '@japa/runner'
import { accountStanding } from '#modules/identity/queries'

/*
 * T-SEC-010, the decision of docs/07 §3.3 rows 1, 3 and 4 that the
 * account-status middleware acts on (`identity.accountStanding`). The HTTP
 * cases are in tests/functional/identity/account_status.spec.ts.
 */

const NOW = Date.parse('2026-11-11T06:00:00.000Z')
const STAMP = '0195f3a0-0000-7000-8000-000000000001'
const fresh = new Date(NOW - 60_000).toISOString()

test.group('T-SEC-010 account standing', () => {
  test('{label} → {expected}')
    .with([
      { label: 'active, same stamp', status: 'active', stamp: STAMP, expected: 'valid' },
      {
        label: 'pending_verification',
        status: 'pending_verification',
        stamp: STAMP,
        expected: 'valid',
      },
      { label: 'suspended', status: 'suspended', stamp: STAMP, expected: 'suspended' },
      { label: 'deactivated', status: 'deactivated', stamp: STAMP, expected: 'suspended' },
      { label: 'anonymized', status: 'anonymized', stamp: STAMP, expected: 'suspended' },
      {
        label: 'suspended with another stamp',
        status: 'suspended',
        stamp: 'x',
        expected: 'suspended',
      },
      { label: 'another stamp', status: 'active', stamp: 'x', expected: 'signed_out' },
      { label: 'no stamp', status: 'active', stamp: undefined, expected: 'signed_out' },
      {
        label: 'a stamp that is not a string',
        status: 'active',
        stamp: 42,
        expected: 'signed_out',
      },
    ])
    .run(({ assert }, { status, stamp, expected }) => {
      const standing = accountStanding(
        { status, securityStamp: STAMP },
        { securityStamp: stamp, authenticatedAt: fresh },
        NOW
      )
      assert.equal(standing, expected)
    })

  test('a missing stamp on both sides is still signed out', ({ assert }) => {
    const user = { status: 'active', securityStamp: undefined as unknown as string }
    assert.equal(
      accountStanding(user, { securityStamp: undefined, authenticatedAt: fresh }, NOW),
      'signed_out'
    )
  })
})

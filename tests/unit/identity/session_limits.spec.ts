import { test } from '@japa/runner'
import { ABSOLUTE_SESSION_LIMIT_MS, olderThan } from '#modules/identity/domain/session_limits'

/*
 * T-SEC-010, row 4 of docs/07 §3.3: the 30-day absolute limit from
 * `authenticated_at`, where a missing value counts as expired (docs/07
 * §3.2). The HTTP cases are in tests/functional/identity/account_status.spec.ts.
 */

test.group('T-SEC-010 the absolute session limit', () => {
  const now = Date.parse('2026-11-11T06:00:00.000Z')
  const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString()

  test('{label} → expired: {expired}')
    .with([
      { label: '29 days', at: daysAgo(29), expired: false },
      { label: 'exactly 30 days', at: daysAgo(30), expired: false },
      {
        label: '30 days and a second',
        at: new Date(now - ABSOLUTE_SESSION_LIMIT_MS - 1000).toISOString(),
        expired: true,
      },
      { label: 'missing', at: undefined, expired: true },
      { label: 'null', at: null, expired: true },
      { label: 'a number', at: now, expired: true },
      { label: 'not a date', at: 'yesterday', expired: true },
    ])
    .run(({ assert }, { at, expired }) => {
      assert.equal(olderThan(at, ABSOLUTE_SESSION_LIMIT_MS, now), expired)
    })
})

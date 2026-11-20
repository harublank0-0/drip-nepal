import { test } from '@japa/runner'
import { ABSOLUTE_SESSION_LIMIT_MS, olderThan } from '#modules/identity/domain/session_limits'
import { sellerSessionIdle } from '#modules/identity/queries'

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

/*
 * T-SEC-009, the seller idle limit of docs/07 §3.4: 12 hours since
 * `seller_seen_at`, else since `authenticated_at`; an unreadable value
 * counts as idle and never falls back. The HTTP cases are in
 * tests/functional/shops/seller_context.spec.ts.
 */
test.group('T-SEC-009 the seller idle limit', () => {
  const now = Date.parse('2026-11-20T06:00:00.000Z')
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60 * 1000).toISOString()

  test('T-SEC-009 {label} → idle: {idle}')
    .with([
      { label: '11 h 59 min since seller_seen_at', sellerSeenAt: minutesAgo(719), idle: false },
      { label: '12 h 1 min since seller_seen_at', sellerSeenAt: minutesAgo(721), idle: true },
      {
        label: 'a fresh seller_seen_at wins over an old authenticated_at',
        sellerSeenAt: minutesAgo(10),
        authenticatedAt: minutesAgo(60 * 24 * 3),
        idle: false,
      },
      {
        label: 'no seller_seen_at, authenticated_at 11 h 59 min ago',
        authenticatedAt: minutesAgo(719),
        idle: false,
      },
      {
        label: 'no seller_seen_at, authenticated_at 12 h 1 min ago',
        authenticatedAt: minutesAgo(721),
        idle: true,
      },
      {
        label: 'an unreadable seller_seen_at, a fresh authenticated_at',
        sellerSeenAt: 'garbage',
        authenticatedAt: minutesAgo(10),
        idle: true,
      },
      { label: 'both missing', idle: true },
    ])
    .run(({ assert }, row) => {
      const session = {
        sellerSeenAt: 'sellerSeenAt' in row ? row.sellerSeenAt : undefined,
        authenticatedAt: 'authenticatedAt' in row ? row.authenticatedAt : undefined,
      }
      assert.equal(sellerSessionIdle(session, now), row.idle)
    })
})

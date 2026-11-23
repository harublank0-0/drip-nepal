import { test } from '@japa/runner'
import {
  ADMIN_IDLE_LIMIT_MS,
  STAFF_ABSOLUTE_LIMIT_MS,
} from '#modules/identity/domain/session_limits'
import { adminStanding, verifiedMfaTime } from '#modules/identity/queries'
import { MFA_WINDOW_MS, STEP_UP_WINDOW_MS } from '#modules/identity/staff'

/*
 * The admin surface's session decisions (docs/07 §3.2, §3.4; docs/06 §4.3;
 * M1 part 5), with a fixed clock:
 * - T-SEC-009: the 7-day staff limit from `authenticated_at`, the 2-hour
 *   admin idle limit from `admin_seen_at` and the 12-hour MFA window, in
 *   that order, where a missing or unreadable time never means "no limit".
 * - T-SEC-008: the MFA proof `{ user_id, at }` counts only for the signed-in
 *   user and only when `at` is not earlier than `authenticated_at`, so one
 *   staff member's check never unlocks another account or a later sign-in;
 *   the 15-minute step-up window reads the same proof.
 * The HTTP cases are in tests/functional/identity/mfa.spec.ts.
 */

const NOW = Date.parse('2026-11-23T06:00:00.000Z')
const USER = '0195f3a0-0000-7000-8000-000000000001'
const OTHER = '0195f3a0-0000-7000-8000-000000000002'
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MINUTE = 60_000
const HOUR = 60 * MINUTE

test.group('T-SEC-008 the MFA proof', () => {
  test('T-SEC-008 {label} → {expected}')
    .with([
      {
        label: 'this user, after the sign-in',
        proof: { user_id: USER, at: ago(MINUTE) },
        signedInAt: ago(HOUR),
        expected: NOW - MINUTE,
      },
      {
        label: 'at the sign-in itself',
        proof: { user_id: USER, at: ago(HOUR) },
        signedInAt: ago(HOUR),
        expected: NOW - HOUR,
      },
      {
        label: 'another account',
        proof: { user_id: OTHER, at: ago(MINUTE) },
        signedInAt: ago(HOUR),
        expected: null,
      },
      {
        label: 'made before this sign-in',
        proof: { user_id: USER, at: ago(2 * HOUR) },
        signedInAt: ago(HOUR),
        expected: null,
      },
      {
        label: 'a bare time, the shape before M1 part 5',
        proof: ago(MINUTE),
        signedInAt: ago(HOUR),
        expected: null,
      },
      { label: 'missing', proof: undefined, signedInAt: ago(HOUR), expected: null },
      {
        label: 'an unreadable time',
        proof: { user_id: USER, at: 'yesterday' },
        signedInAt: ago(HOUR),
        expected: null,
      },
      {
        label: 'no sign-in time',
        proof: { user_id: USER, at: ago(MINUTE) },
        signedInAt: undefined,
        expected: null,
      },
    ])
    .run(({ assert }, { proof, signedInAt, expected }) => {
      assert.equal(verifiedMfaTime(proof, USER, signedInAt), expected)
    })
})

test.group('T-SEC-009 the admin session limits', () => {
  const session = (overrides: Record<string, unknown> = {}) => ({
    authenticatedAt: ago(3 * HOUR),
    adminSeenAt: ago(MINUTE),
    mfaVerifiedAt: { user_id: USER, at: ago(HOUR) },
    ...overrides,
  })

  test('T-SEC-009 {label} → {expected}')
    .with([
      { label: 'fresh', overrides: {}, expected: 'valid' },
      {
        label: 'signed in 7 days ago exactly',
        overrides: {
          authenticatedAt: ago(STAFF_ABSOLUTE_LIMIT_MS),
          mfaVerifiedAt: { user_id: USER, at: ago(HOUR) },
        },
        expected: 'valid',
      },
      {
        label: 'signed in 7 days and a second ago',
        overrides: { authenticatedAt: ago(STAFF_ABSOLUTE_LIMIT_MS + 1000) },
        expected: 'expired',
      },
      { label: 'no sign-in time', overrides: { authenticatedAt: undefined }, expected: 'expired' },
      {
        label: 'admin idle 2 hours and a second',
        overrides: { adminSeenAt: ago(ADMIN_IDLE_LIMIT_MS + 1000) },
        expected: 'idle',
      },
      { label: 'no admin_seen_at', overrides: { adminSeenAt: undefined }, expected: 'idle' },
      {
        label: 'expired wins over idle',
        overrides: {
          authenticatedAt: ago(STAFF_ABSOLUTE_LIMIT_MS + 1000),
          adminSeenAt: undefined,
        },
        expected: 'expired',
      },
      {
        label: 'MFA 12 hours and a second ago',
        overrides: {
          authenticatedAt: ago(13 * HOUR),
          mfaVerifiedAt: { user_id: USER, at: ago(MFA_WINDOW_MS + 1000) },
        },
        expected: 'unverified',
      },
      { label: 'no MFA proof', overrides: { mfaVerifiedAt: undefined }, expected: 'unverified' },
      {
        label: "another account's proof",
        overrides: { mfaVerifiedAt: { user_id: OTHER, at: ago(MINUTE) } },
        expected: 'unverified',
      },
    ])
    .run(({ assert }, { overrides, expected }) => {
      assert.equal(adminStanding(session(overrides), USER, MFA_WINDOW_MS, NOW), expected)
    })

  test('T-SEC-008 the 15-minute step-up reads the same proof', ({ assert }) => {
    const proofAt = (ms: number) => session({ mfaVerifiedAt: { user_id: USER, at: ago(ms) } })
    assert.equal(adminStanding(proofAt(14 * MINUTE), USER, STEP_UP_WINDOW_MS, NOW), 'valid')
    assert.equal(adminStanding(proofAt(16 * MINUTE), USER, STEP_UP_WINDOW_MS, NOW), 'unverified')
  })
})

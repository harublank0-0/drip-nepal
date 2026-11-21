import { test } from '@japa/runner'
import { environmentPolicyViolations, type EnvPolicyValues } from '#start/env_policy'

/*
 * T-ARCH-024: a table-driven test of the env cross-field policy (docs/09
 * §6.2, §6.5). Each case starts from a valid set and breaks one rule, and
 * the policy reports exactly that rule.
 */

const keys = (prefix: string) => ({
  'APP_KEY': `${prefix}-app-key-of-at-least-32-characters`,
  'DATA_ENCRYPTION_KEYS[k1]': `${prefix}-ring`,
  'BLIND_INDEX_KEY': `${prefix}-blind`,
  'HMAC_KEY_LIMITER': `${prefix}-limiter`,
  'HMAC_KEY_AUDIT_IP': `${prefix}-audit-ip`,
  'HMAC_KEY_NOTIFY_ADDRESS': `${prefix}-notify`,
  'HMAC_KEY_TELEMETRY': undefined,
})

const validTest: EnvPolicyValues = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'warn',
  APP_URL: 'http://localhost:3333',
  SESSION_DRIVER: 'memory',
  DB_DATABASE: 'dripnepal_test',
  DB_MIGRATOR_USER: 'dripnepal_migrator',
  DB_MIGRATOR_PASSWORD: true,
  DB_SSL: false,
  DATA_ENCRYPTION_KEY_IDS: ['k1'],
  DATA_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
  KEYS: keys('test'),
}

const validProduction: EnvPolicyValues = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  LOG_LEVEL: 'info',
  APP_URL: 'https://dripnepal.com',
  APP_RELEASE: '3f2a9c1',
  SESSION_DRIVER: 'database',
  DB_DATABASE: 'dripnepal',
  DB_SSL: true,
  DATA_ENCRYPTION_KEY_IDS: ['k1'],
  DATA_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
  COURIER_CALLBACK_KEY_IDS: ['c1'],
  COURIER_CALLBACK_ACTIVE_KEY_ID: 'c1',
  COURIER_URLS: { COURIER_NCM_PRODUCTION_URL: 'https://portal.nepalcanmove.com' },
  KEYS: { ...keys('prod'), 'COURIER_CALLBACK_KEYS[c1]': 'prod-callback' },
}

const validStaging: EnvPolicyValues = { ...validProduction, APP_ENV: 'staging', DB_SSL: false }

type Case = {
  rule: string
  base: EnvPolicyValues
  values: Partial<EnvPolicyValues>
  violation: string
}

const brokenRules: Case[] = [
  {
    rule: 'NODE_ENV=test with the development database [RF-32]',
    base: validTest,
    values: { DB_DATABASE: 'dripnepal' },
    violation: 'DB_DATABASE must end in _test when NODE_ENV=test (RF-32)',
  },
  {
    rule: 'NODE_ENV=test with _test only inside the name [RF-32]',
    base: validTest,
    values: { DB_DATABASE: 'dripnepal_test_copy' },
    violation: 'DB_DATABASE must end in _test when NODE_ENV=test (RF-32)',
  },
  {
    rule: 'APP_ENV=test under NODE_ENV=development',
    base: validTest,
    values: { NODE_ENV: 'development', DB_DATABASE: 'dripnepal' },
    violation: 'APP_ENV=test needs NODE_ENV=test (docs/09 §6.1)',
  },
  {
    rule: 'APP_ENV=staging under NODE_ENV=development',
    base: validStaging,
    values: { NODE_ENV: 'development' },
    violation: 'APP_ENV=staging needs NODE_ENV=production (docs/09 §6.1)',
  },
  {
    rule: 'an active key ID missing from the ring',
    base: validTest,
    values: { DATA_ENCRYPTION_ACTIVE_KEY_ID: 'k2' },
    violation: 'DATA_ENCRYPTION_ACTIVE_KEY_ID is not an ID in DATA_ENCRYPTION_KEYS',
  },
  {
    rule: 'SENTRY_DSN without HMAC_KEY_TELEMETRY',
    base: validTest,
    values: { SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1' },
    violation: 'HMAC_KEY_TELEMETRY is required when SENTRY_DSN is set (docs/09 §5.6)',
  },
  {
    rule: 'production with the memory session store',
    base: validProduction,
    values: { SESSION_DRIVER: 'memory' },
    violation: 'SESSION_DRIVER must be database in staging and production',
  },
  {
    rule: 'staging at debug level',
    base: validStaging,
    values: { LOG_LEVEL: 'debug' },
    violation: 'LOG_LEVEL must not be trace or debug in staging and production',
  },
  {
    rule: 'production with DB_DEBUG [RF-26]',
    base: validProduction,
    values: { DB_DEBUG: true },
    violation: 'DB_DEBUG must be off in staging and production (RF-26)',
  },
  {
    rule: 'production with the test migrator role',
    base: validProduction,
    values: { DB_MIGRATOR_USER: 'dripnepal_migrator' },
    violation: 'DB_MIGRATOR_USER and DB_MIGRATOR_PASSWORD are for tests only',
  },
  {
    rule: 'production on http',
    base: validProduction,
    values: { APP_URL: 'http://dripnepal.com' },
    violation: 'APP_URL must use https:// in staging and production',
  },
  {
    rule: 'staging without APP_RELEASE',
    base: validStaging,
    values: { APP_RELEASE: undefined },
    violation: 'APP_RELEASE must be set in staging and production',
  },
  {
    rule: 'production with a key used twice',
    base: validProduction,
    values: { KEYS: { ...keys('prod'), HMAC_KEY_LIMITER: 'prod-blind' } },
    violation: 'HMAC_KEY_LIMITER must differ from BLIND_INDEX_KEY in staging and production',
  },
  {
    rule: 'production with an HMAC key reused as APP_KEY',
    base: validProduction,
    values: { KEYS: { ...keys('prod'), APP_KEY: 'prod-audit-ip' } },
    violation: 'HMAC_KEY_AUDIT_IP must differ from APP_KEY in staging and production',
  },
  {
    rule: 'production with APP_KEY_PREVIOUS equal to APP_KEY',
    base: validProduction,
    values: {
      KEYS: { ...keys('prod'), APP_KEY_PREVIOUS: 'prod-app-key-of-at-least-32-characters' },
    },
    violation: 'APP_KEY_PREVIOUS must differ from APP_KEY in staging and production',
  },
  {
    rule: 'staging with the committed test APP_KEY [T-SEC-025]',
    base: validStaging,
    values: { KEYS: { ...keys('stage'), APP_KEY: 'dripnepal-test-only-app-key-not-a-secret' } },
    violation: 'APP_KEY is a committed placeholder key, never for staging or production',
  },
  {
    rule: 'production without the courier callback keys (docs/04a §9.14)',
    base: validProduction,
    values: { COURIER_CALLBACK_KEY_IDS: [], COURIER_CALLBACK_ACTIVE_KEY_ID: undefined },
    violation:
      'COURIER_CALLBACK_KEYS and COURIER_CALLBACK_ACTIVE_KEY_ID are required in production',
  },
  {
    rule: 'a courier callback active key missing from its ring',
    base: validTest,
    values: { COURIER_CALLBACK_KEY_IDS: ['c1'], COURIER_CALLBACK_ACTIVE_KEY_ID: 'c2' },
    violation: 'COURIER_CALLBACK_ACTIVE_KEY_ID is not an ID in COURIER_CALLBACK_KEYS',
  },
  {
    rule: 'a courier host on http',
    base: validTest,
    values: { COURIER_URLS: { COURIER_NCM_SANDBOX_URL: 'http://demo.nepalcanmove.com' } },
    violation: 'COURIER_NCM_SANDBOX_URL must use https://',
  },
  {
    rule: 'production without TLS to the database',
    base: validProduction,
    values: { DB_SSL: false },
    violation: 'DB_SSL must be true in production (docs/07 §5.5)',
  },
]

test.group('T-ARCH-024 env cross-field policy', () => {
  test('T-ARCH-024 the valid {name} set passes')
    .with([
      { name: 'test', values: validTest },
      { name: 'staging', values: validStaging },
      { name: 'production', values: validProduction },
      {
        name: 'development',
        values: {
          ...validTest,
          NODE_ENV: 'development' as const,
          APP_ENV: 'development' as const,
          DB_DATABASE: 'dripnepal',
          LOG_LEVEL: 'debug',
          DB_DEBUG: true,
        },
      },
    ])
    .run(({ assert }, { values }) => {
      assert.deepEqual(environmentPolicyViolations(values), [])
    })

  test('T-ARCH-024 breaks boot: {rule}')
    .with(brokenRules)
    .run(({ assert }, { base, values, violation }) => {
      assert.deepEqual(environmentPolicyViolations({ ...base, ...values }), [violation])
    })

  test('T-ARCH-024 development keys may repeat; staging keys may not', ({ assert }) => {
    const shared = { ...keys('x'), HMAC_KEY_LIMITER: 'x-blind' }
    assert.deepEqual(environmentPolicyViolations({ ...validTest, KEYS: shared }), [])
    assert.lengthOf(environmentPolicyViolations({ ...validStaging, KEYS: shared }), 1)
  })
})

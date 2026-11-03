import { test } from '@japa/runner'
import { environmentPolicyViolations, type EnvPolicyValues } from '#start/env_policy'

/*
 * T-ARCH-024: a table-driven test of the env cross-field policy. It starts
 * from a valid set and breaks one rule per case (docs/09 §6.5).
 */
const validTestEnv: EnvPolicyValues = {
  NODE_ENV: 'test',
  DB_DATABASE: 'dripnepal_test',
}

const brokenRules: { rule: string; values: Partial<EnvPolicyValues>; violation: string }[] = [
  {
    rule: 'NODE_ENV=test with the development database [RF-32]',
    values: { DB_DATABASE: 'dripnepal' },
    violation: 'DB_DATABASE must end in _test when NODE_ENV=test (RF-32)',
  },
  {
    rule: 'NODE_ENV=test with _test only inside the name [RF-32]',
    values: { DB_DATABASE: 'dripnepal_test_copy' },
    violation: 'DB_DATABASE must end in _test when NODE_ENV=test (RF-32)',
  },
]

test.group('T-ARCH-024 env cross-field policy', () => {
  test('T-ARCH-024 the valid test set passes', ({ assert }) => {
    assert.deepEqual(environmentPolicyViolations(validTestEnv), [])
  })

  test('T-ARCH-024 breaks boot: {rule}')
    .with(brokenRules)
    .run(({ assert }, { values, violation }) => {
      assert.deepEqual(environmentPolicyViolations({ ...validTestEnv, ...values }), [violation])
    })

  test('T-ARCH-024 the _test suffix is required only under NODE_ENV=test', ({ assert }) => {
    assert.deepEqual(
      environmentPolicyViolations({ NODE_ENV: 'development', DB_DATABASE: 'dripnepal' }),
      []
    )
  })
})

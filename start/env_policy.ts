/*
|--------------------------------------------------------------------------
| Environment cross-field policy
|--------------------------------------------------------------------------
|
| The schema in start/env.ts checks each variable on its own. These rules
| check combinations (docs/09 §6.2). Every broken rule adds one line, and
| start/env.ts throws them together so a failed boot lists them all.
|
| A pure function so T-ARCH-024 can test one broken rule per case.
|
*/

export type EnvPolicyValues = {
  NODE_ENV: 'development' | 'production' | 'test'
  DB_DATABASE: string
}

export function environmentPolicyViolations(values: EnvPolicyValues): string[] {
  const violations: string[] = []

  // Tests must never reach the development database (RF-32).
  if (values.NODE_ENV === 'test' && !values.DB_DATABASE.endsWith('_test')) {
    violations.push('DB_DATABASE must end in _test when NODE_ENV=test (RF-32)')
  }

  return violations
}

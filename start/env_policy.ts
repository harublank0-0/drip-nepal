/*
|--------------------------------------------------------------------------
| Environment cross-field policy
|--------------------------------------------------------------------------
|
| The schema in start/env_schema.ts checks each variable on its own. These
| rules check combinations (docs/09 §6.2). Every broken rule adds one line,
| and start/env.ts throws them together so a failed boot lists them all.
|
| A pure function over plain values so T-ARCH-024 can break one rule per
| case. Key material arrives as base64 strings, compared, never printed.
|
*/

export type EnvPolicyValues = {
  NODE_ENV: 'development' | 'production' | 'test'
  APP_ENV: 'development' | 'test' | 'staging' | 'production'
  LOG_LEVEL: string
  APP_URL: string
  APP_RELEASE?: string
  SESSION_DRIVER: string
  DB_DATABASE: string
  DB_MIGRATOR_USER?: string
  DB_MIGRATOR_PASSWORD?: boolean
  DB_SSL: boolean
  DB_DEBUG?: boolean
  DATA_ENCRYPTION_KEY_IDS: string[]
  DATA_ENCRYPTION_ACTIVE_KEY_ID: string
  SENTRY_DSN?: string
  // Base64 of every key that must differ from the others in staging and prod.
  KEYS: Record<string, string | undefined>
}

const NODE_ENV_FOR = {
  development: 'development',
  test: 'test',
  staging: 'production',
  production: 'production',
} as const

export function environmentPolicyViolations(values: EnvPolicyValues): string[] {
  const violations: string[] = []
  const deployed = values.APP_ENV === 'staging' || values.APP_ENV === 'production'

  if (NODE_ENV_FOR[values.APP_ENV] !== values.NODE_ENV) {
    violations.push(
      `APP_ENV=${values.APP_ENV} needs NODE_ENV=${NODE_ENV_FOR[values.APP_ENV]} (docs/09 §6.1)`
    )
  }

  // Tests must never reach the development database (RF-32).
  if (values.NODE_ENV === 'test' && !values.DB_DATABASE.endsWith('_test')) {
    violations.push('DB_DATABASE must end in _test when NODE_ENV=test (RF-32)')
  }

  if (!values.DATA_ENCRYPTION_KEY_IDS.includes(values.DATA_ENCRYPTION_ACTIVE_KEY_ID)) {
    violations.push('DATA_ENCRYPTION_ACTIVE_KEY_ID is not an ID in DATA_ENCRYPTION_KEYS')
  }

  if (values.SENTRY_DSN && !values.KEYS.HMAC_KEY_TELEMETRY) {
    violations.push('HMAC_KEY_TELEMETRY is required when SENTRY_DSN is set (docs/09 §5.6)')
  }

  if (deployed) {
    if (values.SESSION_DRIVER !== 'database') {
      violations.push('SESSION_DRIVER must be database in staging and production')
    }
    if (values.LOG_LEVEL === 'trace' || values.LOG_LEVEL === 'debug') {
      violations.push('LOG_LEVEL must not be trace or debug in staging and production')
    }
    if (values.DB_DEBUG) {
      violations.push('DB_DEBUG must be off in staging and production (RF-26)')
    }
    if (values.DB_MIGRATOR_USER || values.DB_MIGRATOR_PASSWORD) {
      violations.push('DB_MIGRATOR_USER and DB_MIGRATOR_PASSWORD are for tests only')
    }
    if (!values.APP_URL.startsWith('https://')) {
      violations.push('APP_URL must use https:// in staging and production')
    }
    if (!values.APP_RELEASE) {
      violations.push('APP_RELEASE must be set in staging and production')
    }
    // Every key does one job; a shared key would tie their exposures together (docs/07 §5.5).
    const seen = new Map<string, string>()
    for (const [name, value] of Object.entries(values.KEYS)) {
      if (!value) continue
      const first = seen.get(value)
      if (first) violations.push(`${name} must differ from ${first} in staging and production`)
      else seen.set(value, name)
    }
  }

  if (values.APP_ENV === 'production' && !values.DB_SSL) {
    violations.push('DB_SSL must be true in production (docs/07 §5.5)')
  }

  return violations
}

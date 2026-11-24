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

import { createHash } from 'node:crypto'

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
  COURIER_CALLBACK_KEY_IDS?: string[]
  COURIER_CALLBACK_ACTIVE_KEY_ID?: string
  COURIER_URLS?: Record<string, string | undefined>
  SMTP_HOST?: string
  SMTP_USERNAME?: string
  SMTP_PASSWORD?: boolean
  MAIL_FROM_ADDRESS?: string
  // Object storage (docs/09 §6.1): the names and URLs, and whether the secret is set.
  STORAGE?: Record<string, string | boolean | undefined>
  // Base64 of every key that must differ from the others in staging and prod.
  KEYS: Record<string, string | undefined>
}

/*
 * SHA-256 of every key value committed in .env.example and .env.test,
 * including the fixed test APP_KEY. They are public, so staging and
 * production refuse them (the "default secrets" half of T-SEC-025, docs/09
 * §6.5). Compared by hash so the values are not repeated here; T-ARCH-024
 * checks that this list covers every key in those files.
 */
export const PUBLIC_KEY_SHA256 = new Set([
  'f37eb54e4f00bf2b839536ea8b2ab534fc2d08f720e73698d36c9b8547875c08',
  '8d59c08957be19c18017166c1e14f627756ef456650554f34bd1331658e6d30a',
  'e91989969e295c6a2bb3486adda0cabac0b86930ca0f1a523c646852280ec6b4',
  '6dabadb45cdc8c503eca4802bb883b6221993953617e7caf588637bd08bce8cb',
  '1231c4d33a848d90e66b2d6f89d741c09eb7a9216a366fffd87b1080b586a51d',
  '4e765632993479ce90d4b9b1c098d8e975a562ee9e0fc02f42cbefd8b234ce40',
  'ab0f8276cb14759e05896b21e9ef3f36db5d789af1683aac45940942e8ad0d6c',
  'f7395cfa5a8fb6aa0a92e880176b97e8f7a9306d57568e97981a3168a5fe27a4',
  '167f93adb736fe17f5a33222aea419df2cb34529e3273b971f6a168cfcbcdbcd',
  '7ff8c706a076eb4b7ce4cddc18ccad3f3edd1a58e564a44860c5caab9600a3de',
  '9295bcf965636ef565cfafb190eefb3fbfb29907dab3ee5a15ae4424ea75dd0b',
  'f7695ff1d654c181b94c13a302413705866eb776616d4ce5101e57b520a9f357',
  '69752d06e87c36093bdbb6abdfd6f70612074fe0f3c3c04093bbeece9af4af3b',
])

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

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

  // Courier callbacks (docs/04a §9.14): a ring needs its active key, and production needs both.
  const callbackIds = values.COURIER_CALLBACK_KEY_IDS ?? []
  if (callbackIds.length > 0 || values.COURIER_CALLBACK_ACTIVE_KEY_ID) {
    if (
      !values.COURIER_CALLBACK_ACTIVE_KEY_ID ||
      !callbackIds.includes(values.COURIER_CALLBACK_ACTIVE_KEY_ID)
    ) {
      violations.push('COURIER_CALLBACK_ACTIVE_KEY_ID is not an ID in COURIER_CALLBACK_KEYS')
    }
  } else if (values.APP_ENV === 'production') {
    violations.push(
      'COURIER_CALLBACK_KEYS and COURIER_CALLBACK_ACTIVE_KEY_ID are required in production'
    )
  }
  for (const [name, url] of Object.entries(values.COURIER_URLS ?? {})) {
    if (url && !url.startsWith('https://')) violations.push(`${name} must use https://`)
  }

  if (values.SENTRY_DSN && !values.KEYS.HMAC_KEY_TELEMETRY) {
    violations.push('HMAC_KEY_TELEMETRY is required when SENTRY_DSN is set (docs/09 §5.6)')
  }

  /*
   * Object storage (docs/09 §6.1, R1-S part 2d): all of it or none of it,
   * so a half-configured store fails at boot rather than at the first
   * upload; staging and production need it, over https.
   */
  const storage = values.STORAGE ?? {}
  const storageSet = Object.entries(storage).filter(([, value]) => Boolean(value))
  if (storageSet.length > 0 && storageSet.length < Object.keys(storage).length) {
    const missing = Object.keys(storage).filter((name) => !storage[name])
    violations.push(`Object storage is partly configured; set ${missing.join(', ')} (docs/09 §6.1)`)
  }
  if (deployed && storageSet.length === 0) {
    violations.push('S3_* and MEDIA_PUBLIC_URL are required in staging and production')
  }
  for (const name of ['S3_ENDPOINT', 'MEDIA_PUBLIC_URL']) {
    const url = storage[name]
    if (deployed && typeof url === 'string' && !url.startsWith('https://')) {
      violations.push(`${name} must use https:// in staging and production`)
    }
  }

  // A process that sends email needs a sender address (docs/09 §6.1).
  if (values.SMTP_HOST && !values.MAIL_FROM_ADDRESS) {
    violations.push('MAIL_FROM_ADDRESS is required when SMTP_HOST is set (docs/09 §6.1)')
  }

  if (deployed) {
    if (values.SMTP_USERNAME && !values.SMTP_PASSWORD) {
      violations.push(
        'SMTP_PASSWORD is required when SMTP_USERNAME is set in staging and production (docs/09 §6.1)'
      )
    }
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
      if (PUBLIC_KEY_SHA256.has(sha256(value))) {
        violations.push(`${name} is a committed placeholder key, never for staging or production`)
      }
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

import { Env } from '@adonisjs/core/env'
import { Secret } from '@adonisjs/core/helpers'

/*
|--------------------------------------------------------------------------
| Environment schema (docs/09 §6.1)
|--------------------------------------------------------------------------
|
| Each variable checked on its own; start/env.ts validates the set and then
| the cross-field policy of start/env_policy.ts. A separate module so
| T-ARCH-023 can compare its keys with .env.example. Secrets are declared
| as secrets, so `env.get()` returns a `Secret` that prints redacted.
|
| Variables whose consumers arrive later join with them, under the same
| rules (docs/09 §6.1 "Deliberately not in the schema"): S3_* with media
| (M2), PAYMENT_PROVIDER and the gateway keys with payments.
|
*/

// A key in base64: exactly 32 bytes, canonical padding.
const BASE64_32 = /^[A-Za-z0-9+/]{43}=$/

function key32(key: string, value?: string) {
  if (!value || !BASE64_32.test(value)) {
    throw new Error(`Missing or invalid environment variable "${key}": base64 of exactly 32 bytes`)
  }
  return new Secret(Buffer.from(value, 'base64'))
}

const optionalKey32 = (key: string, value?: string) => (value ? key32(key, value) : undefined)

/*
 * The field-encryption key ring of docs/07 §5.5: `<id>:<base64 of 32
 * bytes>[,…]`. The active ID is checked against it by the policy.
 */
function keyRing(key: string, value?: string) {
  const ring = new Map<string, Buffer>()
  for (const entry of (value ?? '').split(',').filter(Boolean)) {
    const [id, material, ...rest] = entry.split(':')
    if (!/^[a-z0-9_-]{1,32}$/.test(id ?? '') || rest.length > 0 || ring.has(id)) {
      throw new Error(`Invalid environment variable "${key}": entry "${id}" is not <id>:<base64>`)
    }
    ring.set(id, key32(`${key}[${id}]`, material).release())
  }
  if (ring.size === 0) {
    throw new Error(`Missing environment variable "${key}": at least one <id>:<base64> entry`)
  }
  return new Secret(ring)
}

// APP_KEY signs cookies and encrypts tokens: at least 32 characters (docs/09 §6.1).
function appKey(key: string, value?: string) {
  if (!value || value.length < 32) {
    throw new Error(`Missing or invalid environment variable "${key}": at least 32 characters`)
  }
  return new Secret(value)
}
const optionalAppKey = (key: string, value?: string) => (value ? appKey(key, value) : undefined)

const isTest = () => process.env.NODE_ENV === 'test'

export const envSchema = {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  // Staging runs NODE_ENV=production with APP_ENV=staging (docs/03 §5.2).
  APP_ENV: Env.schema.enum(['development', 'test', 'staging', 'production'] as const),
  TZ: Env.schema.enum(['UTC'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum([
    'trace',
    'debug',
    'info',
    'warn',
    'error',
    'fatal',
    'silent',
  ] as const),

  // App
  APP_NAME: (key: string, value?: string) => {
    if (!value || !/^[a-z0-9-]{3,32}$/.test(value)) {
      throw new Error(`Missing or invalid environment variable "${key}": ^[a-z0-9-]{3,32}$`)
    }
    return value
  },
  APP_KEY: appKey,
  // Set only for the 7 days of a yearly rotation, never after an exposure (docs/07 §5.5).
  APP_KEY_PREVIOUS: optionalAppKey,
  APP_URL: Env.schema.string({ format: 'url', tld: false }),
  // The running release (the commit), set by the image build; required in staging and prod.
  APP_RELEASE: Env.schema.string.optional(),

  // How customers reach the store (config/storefront.ts); unset ones are hidden.
  SUPPORT_PHONE: Env.schema.string.optional(),
  SUPPORT_EMAIL: Env.schema.string.optional({ format: 'email' }),
  INSTAGRAM_URL: Env.schema.string.optional({ format: 'url' }),
  FACEBOOK_URL: Env.schema.string.optional({ format: 'url' }),
  TIKTOK_URL: Env.schema.string.optional({ format: 'url' }),

  // Proxies allowed to set X-Forwarded-For: comma-separated CIDRs (docs/11 §3.4)
  TRUSTED_PROXY_CIDRS: Env.schema.string.optional(),

  // Session: the cookie store is gone (RF-04); staging and prod require database.
  SESSION_DRIVER: Env.schema.enum(['database', 'memory'] as const),

  // Database
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.secret(),
  DB_DATABASE: Env.schema.string(),
  // The migrator role for the `pg_migrator` connection: tests only (docs/09 §6.1 "Test roles")
  DB_MIGRATOR_USER: Env.schema.string.optionalWhen(() => !isTest()),
  DB_MIGRATOR_PASSWORD: Env.schema.secret.optionalWhen(() => !isTest()),
  // TLS to PostgreSQL; production requires it (docs/07 §5.5). DB_SSL_CA is a PEM.
  DB_SSL: Env.schema.boolean(),
  DB_SSL_CA: Env.schema.string.optional(),
  DB_POOL_MAX: (key: string, value?: string) => {
    const max = Number(value)
    if (!Number.isInteger(max) || max < 1 || max > 20) {
      throw new Error(`Missing or invalid environment variable "${key}": an integer from 1 to 20`)
    }
    return max
  },
  // Query logging without bindings (docs/09 §7.6); refused in staging and prod.
  DB_DEBUG: Env.schema.boolean.optional(),

  // Uploaded files ("fs" = ./storage on local disk)
  DRIVE_DISK: Env.schema.enum(['fs'] as const),

  // Outgoing email (config/mail.ts). Without SMTP_HOST and MAIL_FROM, email is skipped.
  SMTP_HOST: Env.schema.string.optional({ format: 'host' }),
  SMTP_PORT: Env.schema.number.optional(),
  SMTP_USERNAME: Env.schema.string.optional(),
  SMTP_PASSWORD: Env.schema.secret.optional(),
  MAIL_FROM: Env.schema.string.optional(),

  // Rate limiter store
  LIMITER_STORE: Env.schema.enum(['database', 'memory'] as const),

  // Keys of docs/07 §5.5 and docs/09 §6.1. Staging and prod: all distinct.
  DATA_ENCRYPTION_KEYS: keyRing,
  DATA_ENCRYPTION_ACTIVE_KEY_ID: Env.schema.string(),
  BLIND_INDEX_KEY: key32,
  HMAC_KEY_LIMITER: key32,
  HMAC_KEY_AUDIT_IP: key32,
  HMAC_KEY_NOTIFY_ADDRESS: key32,
  // The hashed user reference of tracker events (docs/09 §5.6); required with SENTRY_DSN.
  HMAC_KEY_TELEMETRY: optionalKey32,
  // The error tracker; no transport reads it until the Sentry adapter lands (docs/09 §5.6).
  SENTRY_DSN: Env.schema.string.optional({ format: 'url', tld: false }),
}

/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| Validates the variables of start/env_schema.ts, then the cross-field
| policy of start/env_policy.ts (docs/09 §6.2). Boot stops with every
| broken rule listed, so the web process, the worker, the test runner and
| every `node ace` command refuse a bad set before anything connects.
| Only config/*.ts and start/*.ts read it (docs/09 §6.3).
|
*/

import { Env, errors } from '@adonisjs/core/env'
import { envSchema } from '#start/env_schema'
import { environmentPolicyViolations } from '#start/env_policy'

const env = await Env.create(new URL('../', import.meta.url), envSchema)

const base64 = (secret: { release(): Buffer } | undefined) => secret?.release().toString('base64')

const violations = environmentPolicyViolations({
  NODE_ENV: env.get('NODE_ENV'),
  APP_ENV: env.get('APP_ENV'),
  LOG_LEVEL: env.get('LOG_LEVEL'),
  APP_URL: env.get('APP_URL'),
  APP_RELEASE: env.get('APP_RELEASE'),
  SESSION_DRIVER: env.get('SESSION_DRIVER'),
  DB_DATABASE: env.get('DB_DATABASE'),
  DB_MIGRATOR_USER: env.get('DB_MIGRATOR_USER'),
  DB_MIGRATOR_PASSWORD: Boolean(env.get('DB_MIGRATOR_PASSWORD')),
  DB_SSL: env.get('DB_SSL'),
  DB_DEBUG: env.get('DB_DEBUG'),
  DATA_ENCRYPTION_KEY_IDS: [...env.get('DATA_ENCRYPTION_KEYS').release().keys()],
  DATA_ENCRYPTION_ACTIVE_KEY_ID: env.get('DATA_ENCRYPTION_ACTIVE_KEY_ID'),
  SENTRY_DSN: env.get('SENTRY_DSN'),
  SMTP_USERNAME: env.get('SMTP_USERNAME'),
  SMTP_PASSWORD: Boolean(env.get('SMTP_PASSWORD')),
  KEYS: {
    // APP_KEY as written: a key's base64 text reused as APP_KEY is caught too.
    APP_KEY: env.get('APP_KEY').release(),
    APP_KEY_PREVIOUS: env.get('APP_KEY_PREVIOUS')?.release(),
    ...Object.fromEntries(
      [...env.get('DATA_ENCRYPTION_KEYS').release()].map(([id, key]) => [
        `DATA_ENCRYPTION_KEYS[${id}]`,
        key.toString('base64'),
      ])
    ),
    BLIND_INDEX_KEY: base64(env.get('BLIND_INDEX_KEY')),
    HMAC_KEY_LIMITER: base64(env.get('HMAC_KEY_LIMITER')),
    HMAC_KEY_AUDIT_IP: base64(env.get('HMAC_KEY_AUDIT_IP')),
    HMAC_KEY_NOTIFY_ADDRESS: base64(env.get('HMAC_KEY_NOTIFY_ADDRESS')),
    HMAC_KEY_TELEMETRY: base64(env.get('HMAC_KEY_TELEMETRY')),
  },
})

if (violations.length > 0) {
  const error = new errors.E_INVALID_ENV_VARIABLES()
  error.help = violations.map((violation) => `- ${violation}`).join('\n')
  throw error
}

export default env

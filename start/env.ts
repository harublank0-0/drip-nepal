/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env, errors } from '@adonisjs/core/env'
import { environmentPolicyViolations } from '#start/env_policy'

const env = await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // DB
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string(),
  DB_DATABASE: Env.schema.string(),
})

/*
 * Cross-field policy (docs/09 §6.2). Boot stops with every broken rule listed,
 * so the web process, the test runner and every `node ace` command refuse a
 * bad combination before anything connects to the database.
 */
const violations = environmentPolicyViolations({
  NODE_ENV: env.get('NODE_ENV'),
  DB_DATABASE: env.get('DB_DATABASE'),
})

if (violations.length > 0) {
  const error = new errors.E_INVALID_ENV_VARIABLES()
  error.help = violations.map((violation) => `- ${violation}`).join('\n')
  throw error
}

export default env

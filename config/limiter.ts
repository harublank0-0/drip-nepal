import env from '#start/env'
import { defineConfig, stores } from '@adonisjs/limiter'

/*
 * Rate limits (docs/06 §9.1; OD-10 resolved). The database store keeps its
 * windows in `rate_limits` (docs/04a §15.4), because PostgreSQL is the only
 * stateful service in R1. Keys are built and HMAC-hashed by
 * app/modules/platform/rate_limits.ts, never by callers.
 */
const limiterConfig = defineConfig({
  default: env.get('LIMITER_STORE'),
  stores: {
    database: stores.database({
      tableName: 'rate_limits',
      // Deletes expired windows every 5 minutes, so the table holds live ones only.
      clearExpiredByTimeout: true,
    }),

    // For local experiments; staging, production and the tests use `database`.
    memory: stores.memory({}),
  },
})

export default limiterConfig

declare module '@adonisjs/limiter/types' {
  export interface LimitersList extends InferLimiters<typeof limiterConfig> {}
}

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/*
 * Health endpoints of docs/11 §7.1, answered as server middleware so they
 * run before the session, shield and auth middleware. Those read the
 * database-backed session, so as routes a database outage would turn the
 * readiness answer into a 500 page instead of a 503.
 *
 * /health/live:  the process serves HTTP, and which release it runs.
 * /health/ready: the database answers and the app is not shutting down.
 *                Used by Compose; Caddy hides it from the internet.
 * Neither answer is cached.
 */
export default class HealthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx
    if (request.method() !== 'GET') return next()

    switch (request.url()) {
      case '/health/live':
        return response.ok({ status: 'ok', release: env.get('APP_RELEASE') ?? 'unknown' })
      case '/health/ready': {
        const ready = await this.#isReady()
        return response.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'error' })
      }
      default:
        return next()
    }
  }

  async #isReady() {
    if (app.isTerminating) return false
    try {
      await db.rawQuery('SELECT 1')
      return true
    } catch (error) {
      logger.error({ err: error }, 'readiness check failed: database')
      return false
    }
  }
}

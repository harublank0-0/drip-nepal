/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import app from '@adonisjs/core/services/app'

/*
 * Route parameters that are database ids must look like a UUID, or the
 * route doesn't match and the request answers 404: PostgreSQL would
 * otherwise reject the value in the query and the request would answer
 * 500. Adonis's own `router.matchers.uuid()` lets any letter through
 * (`[0-9a-zA-F]`), so this one is written out.
 */
const uuid = {
  match: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
  cast: (value: string) => value.toLowerCase(),
}
router.where('id', uuid)

// Order and shop-order numbers match in any case (06 §3); stored numbers are upper case.
const upperCase = { cast: (value: string) => value.toUpperCase() }
router.where('orderNumber', upperCase)
router.where('shopOrderNumber', upperCase)

// The JSON operations (docs/06 §13) and webhooks (§12).
await import('#start/routes/api_v1/seller')
await import('#start/routes/api_v1/admin')
await import('#start/routes/webhooks')

// Development-only routes (RF-40): never in the production route list.
// Test runs load them too, so the route types CI generates under
// NODE_ENV=test match what `pnpm dev` generates (T-ARCH-016).
if (!app.inProduction) await import('#start/routes/dev')

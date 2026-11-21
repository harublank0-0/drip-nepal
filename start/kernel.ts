/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| The HTTP kernel file is used to register the middleware with the server
| or the router.
|
*/

import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

/**
 * The error handler is used to convert an exception
 * to a HTTP response.
 */
server.errorHandler(() => import('#exceptions/handler'))

/**
 * The server middleware stack runs middleware on all the HTTP
 * requests, even if there is no route registered for
 * the request URL.
 */
server.use([
  // First: sanitizes X-Request-Id before anything logs or echoes it (docs/09 §7.4).
  () => import('#middleware/request_context_middleware'),
  () => import('#middleware/access_log_middleware'),
  // Browser headers and the CSP nonce on every answer, health and unknown URLs included (docs/07 §7.3).
  () => import('#middleware/security_headers_middleware'),
  () => import('#middleware/health_middleware'),
  () => import('#middleware/container_bindings_middleware'),
  () => import('@adonisjs/static/static_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
  () => import('@adonisjs/vite/vite_middleware'),
  () => import('#middleware/inertia_middleware'),
])

/**
 * The router middleware stack runs middleware on all the HTTP
 * requests with a registered route.
 */
router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  // Before the session: a refused body creates no session row (docs/06 §9.2).
  () => import('#middleware/request_body_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/shield/shield_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('#middleware/silent_auth_middleware'),
  // Status, stamp and the absolute limit of the signed-in user (docs/07 §3.3).
  () => import('#middleware/account_status_middleware'),
])

/**
 * Named middleware collection must be explicitly assigned to
 * the routes or the routes group.
 */
export const middleware = router.named({
  guest: () => import('#middleware/guest_middleware'),
  auth: () => import('#middleware/auth_middleware'),
  sellerContext: () => import('#middleware/seller_context_middleware'),
})

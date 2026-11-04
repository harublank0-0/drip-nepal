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
router.where('checkoutId', uuid)

import '#modules/auth/routes'
import '#modules/shops/routes'
import '#modules/catalog/routes'
import '#modules/orders/routes'
import '#modules/admin/routes'

if (!app.inProduction) {
  router
    .get('/design-system', ({ inertia }) => {
      return inertia.render('design_system/index', {})
    })
    .as('design-system')
}

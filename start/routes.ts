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

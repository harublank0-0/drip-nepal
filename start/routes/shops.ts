import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.get('/shops/register', [controllers.shops.auth.ShopRegistrations, 'create'])

    router.post('/shops/register', [controllers.shops.auth.ShopRegistrations, 'store'])
  })
  .as('shops.register')
  .middleware(middleware.guest())

router
  .group(() => {
    router.get('/dashboard', [controllers.shops.dashboard.ShopDashboard, 'create'])

    // TODO: let's add settings route and render pages when we get there
    router
      .group(() => {
        // router.get('/overview', [controllers.shops.dashboard.ShopSettings, 'overview'])
      })
      .prefix('/settings')
      .as('settings')
  })
  .as('shop')
  .prefix('/shop/:shopSlug')
  .middleware(middleware.auth())

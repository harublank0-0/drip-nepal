import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.get('/shops/register', [controllers.shops.auth.ShopRegistrations, 'create'])

    router.post('/shops/register', [controllers.shops.auth.ShopRegistrations, 'store'])
  })
  .as('shops')
  .middleware(middleware.guest())

router
  .group(() => {
    router.get('/shops/dashboard', [controllers.shops.dashboard.ShopDashboard, 'create'])
  })
  .as('shops.dashboard')
  .middleware(middleware.auth())

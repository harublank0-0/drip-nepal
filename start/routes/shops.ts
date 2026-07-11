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

router.group(() => {
  router.get('/vendor/shop', [controllers.shops.dashboard.ShopDashboard, 'create'])
  router.get('/vendor/shop/overview', [controllers.shops.dashboard.ShopSettings, 'overview'])
  router.get('/vendor/shop/general', [controllers.shops.dashboard.ShopSettings, 'general'])
  router.get('/vendor/shop/branding', [controllers.shops.dashboard.ShopSettings, 'branding'])
  router.get('/vendor/shop/business-hours', [
    controllers.shops.dashboard.ShopSettings,
    'businessHours',
  ])
  router.get('/vendor/shop/shipping', [controllers.shops.dashboard.ShopSettings, 'shipping'])
  router.get('/vendor/shop/payments', [controllers.shops.dashboard.ShopSettings, 'payments'])
  router.get('/vendor/shop/notifications', [
    controllers.shops.dashboard.ShopSettings,
    'notifications',
  ])
  router.get('/vendor/shop/seo', [controllers.shops.dashboard.ShopSettings, 'seo'])
  router.get('/vendor/shop/policies', [controllers.shops.dashboard.ShopSettings, 'policies'])
  router.get('/vendor/shop/social', [controllers.shops.dashboard.ShopSettings, 'social'])
  router.get('/vendor/shop/analytics', [controllers.shops.dashboard.ShopSettings, 'analytics'])
  router.get('/vendor/shop/security', [controllers.shops.dashboard.ShopSettings, 'security'])
  router.get('/vendor/shop/danger', [controllers.shops.dashboard.ShopSettings, 'danger'])
})
// .middleware(middleware.auth())

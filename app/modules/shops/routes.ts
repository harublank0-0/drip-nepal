import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const ShopRegistrationController = () =>
  import('#modules/shops/controllers/shop_registrations_controller')
const ShopDashboardController = () => import('#modules/shops/controllers/shop_dashboard_controller')
const ShopProductsController = () => import('#modules/shops/controllers/shop_products_controller')
const ShopOrdersController = () => import('#modules/shops/controllers/shop_orders_controller')

/*
 * Not guest-only: the owner is logged in right after registering and
 * comes back here to see the success screen. The controller sends other
 * logged-in users away.
 */
router
  .group(() => {
    router.get('register', [ShopRegistrationController, 'create'])
  })
  .as('ui.auth.shop')
  .prefix('auth/shop')

router
  .group(() => {
    router.post('shop/register', [ShopRegistrationController, 'store'])
  })
  .as('api.auth.shop')
  .prefix('api/v1')
  .use(middleware.guest())

/*
 * Shop dashboard pages. `shopAccess` loads the shop from `:shopSlug` and
 * 404s for users who don't own or work in it.
 */
router
  .group(() => {
    router.get('dashboard', [ShopDashboardController, 'create'])

    router.get('products', [ShopProductsController, 'index'])
    router.get('products/create', [ShopProductsController, 'create'])
    router.get('products/:id/edit', [ShopProductsController, 'edit'])

    router.get('orders', [ShopOrdersController, 'index'])
    router.get('orders/:orderNumber', [ShopOrdersController, 'show'])
  })
  .as('ui.shops')
  .prefix('shops/:shopSlug')
  .use([middleware.auth(), middleware.shopAccess()])

/*
 * Product updates use POST because the form uploads files, and multipart
 * bodies aren't parsed for PUT.
 */
router
  .group(() => {
    router.post('products', [ShopProductsController, 'store'])
    router.post('products/:id', [ShopProductsController, 'update'])
    router.delete('products/:id', [ShopProductsController, 'destroy'])

    router.get('orders/awaiting', [ShopOrdersController, 'awaiting'])
    router.post('orders/:orderNumber/status', [ShopOrdersController, 'updateStatus'])
  })
  .as('api.shops')
  .prefix('api/v1/shops/:shopSlug')
  .use([middleware.auth(), middleware.shopAccess()])

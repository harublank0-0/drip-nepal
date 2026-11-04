import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const CartController = () => import('#modules/orders/controllers/cart_controller')
const CheckoutController = () => import('#modules/orders/controllers/checkout_controller')
const AccountOrdersController = () =>
  import('#modules/orders/controllers/account_orders_controller')
const TrackOrdersController = () => import('#modules/orders/controllers/track_orders_controller')

/*
 * Cart and checkout, for logged-in users and guests alike. A guest's cart
 * is kept by a token in their session.
 */
router.get('/cart', [CartController, 'show']).as('cart.show')
router.get('/checkout', [CheckoutController, 'show']).as('checkout.show')
router.get('/checkout/success/:checkoutId', [CheckoutController, 'success']).as('checkout.success')

router
  .group(() => {
    router.post('cart/items', [CartController, 'store']).as('cart.items.store')
    router.post('cart/items/:id', [CartController, 'update']).as('cart.items.update')
    router.delete('cart/items/:id', [CartController, 'destroy']).as('cart.items.destroy')
    router.post('checkout', [CheckoutController, 'store']).as('checkout.store')
  })
  .prefix('api/v1')
  .as('api')

/*
 * Tracking an order without an account: order number plus the mobile
 * number it was placed with.
 */
router.get('/track-order', [TrackOrdersController, 'index']).as('orders.track')
router.get('/track-order/:orderNumber', [TrackOrdersController, 'show']).as('orders.track.show')
router
  .group(() => {
    router.post('track-order', [TrackOrdersController, 'lookup']).as('orders.track.lookup')
    router
      .post('track-order/:orderNumber/cancel', [TrackOrdersController, 'cancel'])
      .as('orders.track.cancel')
  })
  .prefix('api/v1')
  .as('api')

/*
 * A logged-in customer's orders.
 */
router
  .group(() => {
    router.get('/account/orders', [AccountOrdersController, 'index']).as('account.orders.index')
    router
      .get('/account/orders/:orderNumber', [AccountOrdersController, 'show'])
      .as('account.orders.show')
  })
  .use(middleware.auth())

router
  .post('api/v1/account/orders/:orderNumber/cancel', [AccountOrdersController, 'cancel'])
  .as('api.account.orders.cancel')
  .use(middleware.auth())

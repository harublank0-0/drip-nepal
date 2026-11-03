import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const CartController = () => import('#modules/orders/controllers/cart_controller')
const CheckoutController = () => import('#modules/orders/controllers/checkout_controller')
const AccountOrdersController = () =>
  import('#modules/orders/controllers/account_orders_controller')

/*
 * Cart, checkout and the customer's orders. All need a logged-in user;
 * guests are sent to the login page.
 */
router
  .group(() => {
    router.get('/cart', [CartController, 'show']).as('cart.show')
    router.get('/checkout', [CheckoutController, 'show']).as('checkout.show')
    router
      .get('/checkout/success/:checkoutId', [CheckoutController, 'success'])
      .as('checkout.success')
    router.get('/account/orders', [AccountOrdersController, 'index']).as('account.orders.index')
    router
      .get('/account/orders/:orderNumber', [AccountOrdersController, 'show'])
      .as('account.orders.show')
  })
  .use(middleware.auth())

router
  .group(() => {
    router.post('cart/items', [CartController, 'store']).as('cart.items.store')
    router.post('cart/items/:id', [CartController, 'update']).as('cart.items.update')
    router.delete('cart/items/:id', [CartController, 'destroy']).as('cart.items.destroy')
    router.post('checkout', [CheckoutController, 'store']).as('checkout.store')
    router
      .post('account/orders/:orderNumber/cancel', [AccountOrdersController, 'cancel'])
      .as('account.orders.cancel')
  })
  .prefix('api/v1')
  .as('api')
  .use(middleware.auth())

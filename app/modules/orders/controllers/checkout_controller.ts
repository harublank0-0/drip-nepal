import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { errors as lucidErrors } from '@adonisjs/lucid'
import Order from '#models/order'
import UserAddress from '#models/user_address'
import CartService from '#modules/orders/services/cart_service'
import CheckoutService from '#modules/orders/services/checkout_service'
import OrderService from '#modules/orders/services/order_service'
import { cartOwner, guestToken, rememberOrders, rememberedOrders } from '#modules/orders/customer'
import { checkoutValidator } from '#modules/orders/validators/checkout'
import {
  clientNetwork,
  consumeOrReject,
  guestCheckoutLimiter,
  limiterKey,
} from '#modules/auth/rate_limits'
import AddressTransformer from '#transformers/address_transformer'
import CartSummaryTransformer from '#transformers/cart_summary_transformer'
import OrderTransformer from '#transformers/order_transformer'

/*
 * Checkout for logged-in users and guests. A guest's address is used for
 * the order only; a user's is saved to their address book.
 */
@inject()
export default class CheckoutController {
  constructor(
    protected cart: CartService,
    protected checkout: CheckoutService,
    protected orders: OrderService
  ) {}

  async show(ctx: HttpContext) {
    const items = await this.cart.items(cartOwner(ctx))

    if (items.length === 0) {
      return ctx.response.redirect().toRoute('cart.show')
    }

    const user = ctx.auth.user
    const addresses = user
      ? await UserAddress.query()
          .where('user_id', user.id)
          .orderBy('is_default', 'desc')
          .orderBy('created_at', 'desc')
      : []

    return ctx.inertia.render('commerce/checkout/index', {
      cart: CartSummaryTransformer.transform(this.cart.summarize(items)),
      addresses: AddressTransformer.transform(addresses),
    })
  }

  async store(ctx: HttpContext) {
    const { request, response, session, auth } = ctx
    const payload = await request.validateUsing(checkoutValidator)

    if (auth.user) {
      const { checkoutId } = await this.checkout.placeOrders({ user: auth.user }, payload)
      return response.redirect().toRoute('checkout.success', { checkoutId })
    }

    await consumeOrReject(
      guestCheckoutLimiter(),
      limiterKey('checkout:ip', clientNetwork(request.ip())),
      'cart'
    )
    const { checkoutId, orderNumbers } = await this.checkout.placeOrders(
      { guestToken: guestToken(session) ?? '' },
      payload
    )
    // The guest can come back to these orders from this browser.
    rememberOrders(session, orderNumbers)

    return response.redirect().toRoute('checkout.success', { checkoutId })
  }

  async success({ inertia, auth, params, session }: HttpContext) {
    // The buyer's own orders, or orders this browser placed as a guest.
    const remembered = rememberedOrders(session)
    const orders: Order[] = await this.orders
      .detailQuery()
      .where('checkout_id', params.checkoutId)
      .where((scope) => {
        if (auth.user) scope.where('user_id', auth.user.id)
        scope.orWhere((guest) => guest.whereNull('user_id').whereIn('order_number', remembered))
      })
      .orderBy('created_at', 'asc')

    if (orders.length === 0) {
      throw new lucidErrors.E_ROW_NOT_FOUND()
    }

    return inertia.render('commerce/checkout/success', {
      orders: OrderTransformer.transform(orders),
      guest: !auth.user,
    })
  }
}

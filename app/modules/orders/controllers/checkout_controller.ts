import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { errors as lucidErrors } from '@adonisjs/lucid'
import Order from '#models/order'
import UserAddress from '#models/user_address'
import CartService from '#modules/orders/services/cart_service'
import CheckoutService from '#modules/orders/services/checkout_service'
import OrderService from '#modules/orders/services/order_service'
import { checkoutValidator } from '#modules/orders/validators/checkout'
import AddressTransformer from '#transformers/address_transformer'
import CartSummaryTransformer from '#transformers/cart_summary_transformer'
import OrderTransformer from '#transformers/order_transformer'

@inject()
export default class CheckoutController {
  constructor(
    protected cart: CartService,
    protected checkout: CheckoutService,
    protected orders: OrderService
  ) {}

  async show({ inertia, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const items = await this.cart.items(user)

    if (items.length === 0) {
      return response.redirect().toRoute('cart.show')
    }

    const addresses = await UserAddress.query()
      .where('user_id', user.id)
      .orderBy('is_default', 'desc')
      .orderBy('created_at', 'desc')

    return inertia.render('commerce/checkout/index', {
      cart: CartSummaryTransformer.transform(this.cart.summarize(items)),
      addresses: AddressTransformer.transform(addresses),
    })
  }

  async store({ request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(checkoutValidator)
    const checkoutId = await this.checkout.placeOrders(auth.getUserOrFail(), payload)

    return response.redirect().toRoute('checkout.success', { checkoutId })
  }

  async success({ inertia, auth, params }: HttpContext) {
    const orders: Order[] = await this.orders
      .detailQuery()
      .where('user_id', auth.getUserOrFail().id)
      .where('checkout_id', params.checkoutId)
      .orderBy('created_at', 'asc')

    if (orders.length === 0) {
      throw new lucidErrors.E_ROW_NOT_FOUND()
    }

    return inertia.render('commerce/checkout/success', {
      orders: OrderTransformer.transform(orders),
    })
  }
}

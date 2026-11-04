import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { errors as lucidErrors } from '@adonisjs/lucid'
import { errors as vineErrors } from '@vinejs/vine'
import type Order from '#models/order'
import OrderService from '#modules/orders/services/order_service'
import { phoneDigits, rememberOrders, rememberedOrders } from '#modules/orders/customer'
import { trackOrderValidator } from '#modules/orders/validators/track'
import {
  clientNetwork,
  limiterKey,
  orderLookupLimiter,
  penalizeFailures,
  tooManyAttempts,
} from '#modules/auth/rate_limits'
import OrderTransformer from '#transformers/order_transformer'

const NOT_FOUND = 'We couldn’t find an order with that order ID and mobile number.'

/*
 * Order tracking without an account. A guest opens an order with its
 * number and the mobile number it was placed with; after that, and for
 * orders they placed as a guest, this browser remembers it.
 */
@inject()
export default class TrackOrdersController {
  constructor(protected orders: OrderService) {}

  async index({ inertia, session }: HttpContext) {
    const remembered = rememberedOrders(session)
    const orders = remembered.length
      ? await this.orders
          .detailQuery()
          .whereIn('order_number', remembered)
          .orderBy('created_at', 'desc')
      : []

    return inertia.render('orders/track', {
      orders: OrderTransformer.transform(orders),
    })
  }

  async lookup({ request, response, session }: HttpContext) {
    const { orderNumber, phone } = await request.validateUsing(trackOrderValidator)
    const key = limiterKey('track:ip', clientNetwork(request.ip()))

    // Only failed lookups count, so a customer checking often isn't blocked.
    // A lookup that finds its order doesn't reset the failed ones before it.
    const [throttled, order] = await penalizeFailures(orderLookupLimiter(), key, async () => {
      const found = await this.orders.findByNumberAndPhone(orderNumber, phoneDigits(phone))
      if (!found) throw new lucidErrors.E_ROW_NOT_FOUND()
      return found
    }).catch((error) => {
      if (error instanceof lucidErrors.E_ROW_NOT_FOUND) {
        throw new vineErrors.E_VALIDATION_ERROR([{ field: 'orderNumber', message: NOT_FOUND }])
      }
      throw error
    })
    if (throttled) tooManyAttempts('orderNumber', throttled.response.availableIn)

    rememberOrders(session, [order.orderNumber])
    return response.redirect().toRoute('orders.track.show', { orderNumber: order.orderNumber })
  }

  async show({ inertia, params, auth, session }: HttpContext) {
    const order = await this.#findViewable(params.orderNumber, auth.user?.id, session)

    return inertia.render('account/orders/show', {
      order: OrderTransformer.transform(order),
      guest: true,
    })
  }

  async cancel({ params, auth, session, response }: HttpContext) {
    const order = await this.#findViewable(params.orderNumber, auth.user?.id, session)
    await this.orders.cancelByCustomer(order)

    session.flash('success', `Order ${order.orderNumber} cancelled`)
    return response.redirect().back()
  }

  /*
   * An order this browser may open: one it remembers, or the logged-in
   * user's own. Anything else answers 404, like a missing order.
   */
  async #findViewable(
    orderNumber: string,
    userId: string | undefined,
    session: HttpContext['session']
  ): Promise<Order> {
    const order = await this.orders
      .detailQuery()
      .where('order_number', String(orderNumber).toUpperCase())
      .firstOrFail()

    const remembered = rememberedOrders(session).includes(order.orderNumber)
    const own = userId !== undefined && order.userId === userId
    if (!remembered && !own) throw new lucidErrors.E_ROW_NOT_FOUND()
    return order
  }
}

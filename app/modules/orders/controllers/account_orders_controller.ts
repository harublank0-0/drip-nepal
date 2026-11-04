import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrderService from '#modules/orders/services/order_service'
import OrderTransformer from '#transformers/order_transformer'

@inject()
export default class AccountOrdersController {
  constructor(protected orders: OrderService) {}

  async index({ inertia, auth, request }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const orders = await this.orders
      .detailQuery()
      .where('user_id', auth.getUserOrFail().id)
      .orderBy('created_at', 'desc')
      .paginate(page, 10)

    return inertia.render('account/orders/index', {
      orders: OrderTransformer.paginate(orders.all(), orders.getMeta()),
    })
  }

  async show({ inertia, auth, params }: HttpContext) {
    const order = await this.orders.findForCustomer(auth.getUserOrFail(), params.orderNumber)

    return inertia.render('account/orders/show', {
      order: OrderTransformer.transform(order),
    })
  }

  async cancel({ auth, params, response, session }: HttpContext) {
    const order = await this.orders.findForCustomer(auth.getUserOrFail(), params.orderNumber)
    await this.orders.cancelByCustomer(order)

    session.flash('success', `Order ${order.orderNumber} cancelled`)
    return response.redirect().back()
  }
}

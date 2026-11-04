import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import OrderService from '#modules/orders/services/order_service'
import { ORDER_TRANSITIONS, OrderStatusValues, type OrderStatus } from '#constants/order'
import OrderTransformer from '#transformers/order_transformer'

const statusValidator = vine.create({
  status: vine.enum(OrderStatusValues),
})

@inject()
export default class ShopOrdersController {
  constructor(protected orders: OrderService) {}

  async index({ inertia, request, shop }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const status = String(request.input('status') ?? '')

    const query = this.orders.detailQuery().where('shop_id', shop.id).orderBy('created_at', 'desc')
    if (OrderStatusValues.includes(status as OrderStatus)) {
      query.where('status', status)
    }
    const orders = await query.paginate(page, 20)

    const counts = await db
      .from('orders')
      .where('shop_id', shop.id)
      .groupBy('status')
      .select('status')
      .count('* as total')

    return inertia.render('shops/dashboard/orders/index', {
      orders: OrderTransformer.paginate(orders.all(), orders.getMeta()),
      filters: { status },
      counts: Object.fromEntries(counts.map((row) => [row.status, Number(row.total)])) as Record<
        string,
        number
      >,
    })
  }

  /*
   * JSON for the dashboard's new-order indicator, polled every 60 seconds
   * while a dashboard tab is visible (FR-NOT-003).
   */
  async awaiting({ shop }: HttpContext) {
    return { pending: await this.orders.awaitingCount(shop) }
  }

  async show({ inertia, params, shop }: HttpContext) {
    const order = await this.orders.findForShop(shop, params.orderNumber)

    return inertia.render('shops/dashboard/orders/show', {
      order: OrderTransformer.transform(order),
      nextStatuses: ORDER_TRANSITIONS[order.status as OrderStatus] ?? [],
    })
  }

  async updateStatus({ request, response, params, session, shop }: HttpContext) {
    const { status } = await request.validateUsing(statusValidator)
    const order = await this.orders.findForShop(shop, params.orderNumber)
    await this.orders.transition(order, status)

    session.flash('success', `Order ${order.orderNumber} marked ${status}`)
    return response.redirect().back()
  }
}

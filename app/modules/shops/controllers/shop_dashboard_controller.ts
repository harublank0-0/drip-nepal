import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import OrderService from '#modules/orders/services/order_service'
import { OrderStatus } from '#constants/order'
import { ProductStatus, VariantStatus } from '#constants/product'
import OrderTransformer from '#transformers/order_transformer'

const LOW_STOCK = 3

@inject()
export default class ShopDashboardController {
  constructor(protected orders: OrderService) {}

  async create({ inertia, shop }: HttpContext) {
    const [orderStats, productStats, lowStock, recentOrders] = await Promise.all([
      db
        .from('orders')
        .where('shop_id', shop.id)
        .select(
          db.raw(`count(*) filter (where status = ?) as to_confirm`, [OrderStatus.PENDING]),
          db.raw(`count(*) filter (where status = ?) as to_ship`, [OrderStatus.CONFIRMED]),
          db.raw(`coalesce(sum(grand_total) filter (where status = ?), 0) as revenue`, [
            OrderStatus.DELIVERED,
          ]),
          db.raw(`count(*) filter (where status = ?) as delivered`, [OrderStatus.DELIVERED])
        )
        .first(),
      db
        .from('products')
        .where('shop_id', shop.id)
        .whereNull('deleted_at')
        .select(
          db.raw(`count(*) filter (where status = ?) as active`, [ProductStatus.ACTIVE]),
          db.raw(`count(*) filter (where status = ?) as draft`, [ProductStatus.DRAFT])
        )
        .first(),
      db
        .from('product_variants as pv')
        .join('products as p', 'p.id', 'pv.product_id')
        .where('p.shop_id', shop.id)
        .whereNull('p.deleted_at')
        .where('pv.status', VariantStatus.ACTIVE)
        .where('pv.quantity', '<=', LOW_STOCK)
        .select('p.id as productId', 'p.name', 'pv.sku', 'pv.quantity')
        .orderBy('pv.quantity', 'asc')
        .limit(8),
      this.orders
        .shopDetailQuery()
        .where('shop_id', shop.id)
        .orderBy('created_at', 'desc')
        .limit(5),
    ])

    return inertia.render('shops/dashboard/index', {
      stats: {
        ordersToConfirm: Number(orderStats?.to_confirm ?? 0),
        ordersToShip: Number(orderStats?.to_ship ?? 0),
        deliveredOrders: Number(orderStats?.delivered ?? 0),
        revenue: Number(orderStats?.revenue ?? 0),
        activeProducts: Number(productStats?.active ?? 0),
        draftProducts: Number(productStats?.draft ?? 0),
      },
      lowStock: lowStock.map((row) => ({
        productId: row.productId as string,
        name: row.name as string,
        sku: row.sku as string,
        quantity: Number(row.quantity),
      })),
      recentOrders: OrderTransformer.transform(recentOrders).useVariant('forShop'),
    })
  }
}

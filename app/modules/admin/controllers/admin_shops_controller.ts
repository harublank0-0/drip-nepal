import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import Shop from '#models/shop'
import { ShopStatus } from '#constants/shop_status'
import AdminShopTransformer from '#transformers/admin_shop_transformer'

const STATUS_FILTERS = [ShopStatus.PENDING, ShopStatus.ACTIVE, ShopStatus.SUSPENDED] as const

const statusValidator = vine.create({
  status: vine.enum([ShopStatus.ACTIVE, ShopStatus.SUSPENDED]),
})

export default class AdminShopsController {
  /*
   * Shops waiting for approval first; tabs for active and suspended ones.
   */
  async index({ inertia, request }: HttpContext) {
    const requested = String(request.input('status') ?? ShopStatus.PENDING)
    const status = (STATUS_FILTERS as readonly string[]).includes(requested)
      ? requested
      : ShopStatus.PENDING
    const page = Math.max(1, Number(request.input('page', 1)) || 1)

    const shops = await Shop.query()
      .where('status', status)
      .whereNull('deleted_at')
      .preload('owner')
      .preload('addresses')
      .withCount('products', (products) => products.whereNull('deleted_at'))
      .orderBy('created_at', status === ShopStatus.PENDING ? 'asc' : 'desc')
      .paginate(page, 20)

    const counts = await db
      .from('shops')
      .whereNull('deleted_at')
      .groupBy('status')
      .select('status')
      .count('* as total')

    return inertia.render('admin/shops/index', {
      adminShops: AdminShopTransformer.paginate(shops.all(), shops.getMeta()),
      filters: { status },
      counts: Object.fromEntries(counts.map((row) => [row.status, Number(row.total)])) as Record<
        string,
        number
      >,
    })
  }

  /*
   * Approve (active) or suspend a shop. Suspended shops and their products
   * disappear from the storefront; the owner keeps dashboard access.
   */
  async updateStatus({ request, response, params, session }: HttpContext) {
    const { status } = await request.validateUsing(statusValidator)
    const shop = await Shop.query().where('id', params.id).whereNull('deleted_at').firstOrFail()

    shop.status = status
    if (status === ShopStatus.ACTIVE && !shop.verifiedAt) {
      shop.verifiedAt = DateTime.now()
    }
    await shop.save()

    session.flash(
      'success',
      status === ShopStatus.ACTIVE ? `${shop.name} is live` : `${shop.name} is suspended`
    )
    return response.redirect().back()
  }
}

import type { HttpContext } from '@adonisjs/core/http'

export default class ShopDashboardController {
  async create({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/index', {})
  }
}

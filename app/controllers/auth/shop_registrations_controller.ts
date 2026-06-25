import type { HttpContext } from '@adonisjs/core/http'

export default class ShopRegistrationController {
  /*
   * Show the multi step vendor registration form
   */
  async create({ inertia }: HttpContext) {
    return inertia.render('shops/signup/index', {})
  }

  async store({}: HttpContext) {
    return {
      ok: 'ok',
    }
  }
}

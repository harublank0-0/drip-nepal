import { shopSignupValidator } from '#validators/auth/shop'
import type { HttpContext } from '@adonisjs/core/http'

export default class ShopRegistrationController {
  /*
   * Show the multi step vendor registration form
   */
  async create({ inertia }: HttpContext) {
    return inertia.render('shops/signup/index', {})
  }

  async store({ request, response }: HttpContext) {
    const data = await request.validateUsing(shopSignupValidator)

    return response.status(201).json({
      ok: 'ok',
    })
  }
}

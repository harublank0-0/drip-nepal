import User from '#models/user'
import { signupValidator } from '#modules/auth/validators/user'

import type { HttpContext } from '@adonisjs/core/http'

export default class NewAccountController {
  /*
   * Renders the signup page to register new user
   */
  async create({ inertia }: HttpContext) {
    return inertia.render('auth/signup', {})
  }

  /*
   * Registers a new user and logins
   */
  async store({ request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(signupValidator)
    const user = await User.create({ ...payload })

    await auth.use('web').login(user)
    response.redirect().toRoute('home')
  }
}

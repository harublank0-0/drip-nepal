import { userSignupValidator } from '#modules/auth/validators/user'
import { UserService } from '#modules/users/index'
import { inject } from '@adonisjs/core'

import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class NewAccountController {
  constructor(protected userService: UserService) {}
  /*
   * Renders the signup page to register new user
   */
  async create({ inertia }: HttpContext) {
    return inertia.render(
      'auth/signup',
      {},
      {
        title: 'Sign Up',
        description: 'Create a new account',
      }
    )
  }

  /*
   * Registers a new user and logins
   */
  async store({ request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(userSignupValidator)
    const user = await this.userService.create(payload)

    await auth.use('web').login(user)
    response.redirect().toRoute('home')
  }
}

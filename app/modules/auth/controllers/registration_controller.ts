import { userSignupValidator } from '#modules/auth/validators/user'
import { UserService } from '#modules/users/index'
import { inject } from '@adonisjs/core'
import { signIn } from '#modules/auth/account_access'
import {
  clientNetwork,
  consumeOrReject,
  limiterKey,
  signupNetworkLimiter,
} from '#modules/auth/rate_limits'

import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class NewAccountController {
  constructor(protected userService: UserService) {}
  /*
   * Renders the signup page to register new user
   */
  async create({ inertia }: HttpContext) {
    return inertia.render('auth/signup', {})
  }

  /*
   * Registers a new user and logins
   */
  async store(ctx: HttpContext) {
    await consumeOrReject(
      signupNetworkLimiter(),
      limiterKey('signup:ip', clientNetwork(ctx.request.ip())),
      'email'
    )
    const payload = await ctx.request.validateUsing(userSignupValidator)
    const user = await this.userService.create(payload)

    await signIn(ctx, user)
    return ctx.response.redirect().toIntendedRoute('home')
  }
}

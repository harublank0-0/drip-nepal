import User from '#models/user'
import { userLoginValidator } from '#modules/auth/validators/user'
import { canSignIn, signIn } from '#modules/auth/account_access'
import { errors as authErrors } from '@adonisjs/auth'
import { errors as vineErrors } from '@vinejs/vine'

import type { HttpContext } from '@adonisjs/core/http'

/*
 * One message for a wrong password, an unknown email and a blocked account,
 * so the form does not reveal which emails exist or are suspended.
 */
const LOGIN_FAILED = 'The email or password is incorrect'

export default class SessionController {
  /*
   * A user login page
   */
  async create({ inertia }: HttpContext) {
    return inertia.render('auth/login', {})
  }

  /*
   * Endpoint to login user
   */
  async store(ctx: HttpContext) {
    const { email, password } = await ctx.request.validateUsing(userLoginValidator)

    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch (error) {
      if (error instanceof authErrors.E_INVALID_CREDENTIALS) {
        throw new vineErrors.E_VALIDATION_ERROR([{ field: 'email', message: LOGIN_FAILED }])
      }
      throw error
    }

    if (!canSignIn(user)) {
      throw new vineErrors.E_VALIDATION_ERROR([{ field: 'email', message: LOGIN_FAILED }])
    }

    await signIn(ctx, user)
    return ctx.response.redirect().toRoute('home')
  }

  /*
   * Endpoint to logout the logged in user
   */
  async destroy({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    return response.redirect().toRoute('home')
  }
}

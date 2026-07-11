import User from '#models/user'
import { loginValidator } from '#validators/auth/user'
import { errors } from '@adonisjs/auth'
import type { HttpContext } from '@adonisjs/core/http'

export default class SessionController {
  /*
   * A user login page
   */
  async create({ inertia }: HttpContext) {
    return inertia.render('auth/login', {})
  }

  /* Endpoint to login user
   */
  async store({ request, auth, response, inertia }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    try {
      const user = await User.verifyCredentials(email, password)
      await auth.use('web').login(user)
      response.redirect().toRoute('home')
    } catch (e) {
      if (e instanceof errors.E_INVALID_CREDENTIALS) {
        return inertia.render('auth/login', { error: e.message })
      }
    }
  }

  /*
   * Endpoint to logout the logged in user
   */
  async destroy({ auth, response }: HttpContext) {
    console.log('delete user. i mean logout user.')
    await auth.use('web').logout()
    response.redirect().toRoute('home')
  }
}

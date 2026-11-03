import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { errors as lucidErrors } from '@adonisjs/lucid'

/*
 * Lets platform admins through. Everyone else gets a 404 so the admin
 * area doesn't advertise itself. Must run after the `auth` middleware.
 */
export default class AdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()
    if (!(await user.isAdmin())) {
      throw new lucidErrors.E_ROW_NOT_FOUND()
    }

    return next()
  }
}

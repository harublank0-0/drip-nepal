import Shop from '#models/shop'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    /*
     * The shop resolved from the `:shopSlug` route param. Only set on
     * routes that use the `shopAccess` middleware.
     */
    shop: Shop
  }
}

/*
 * Loads the shop from the `:shopSlug` param and makes sure the logged-in
 * user owns it or works in it. Anyone else gets a 404, so we don't reveal
 * which shop slugs exist.
 *
 * Must run after the `auth` middleware.
 */
export default class ShopAccessMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()

    ctx.shop = await Shop.query()
      .where('slug', ctx.params.shopSlug)
      .whereNull('deleted_at')
      .where((query) => {
        query
          .where('owner_id', user.id)
          .orWhereHas('staffRoles', (staff) => staff.where('user_id', user.id))
      })
      .firstOrFail()

    return next()
  }
}

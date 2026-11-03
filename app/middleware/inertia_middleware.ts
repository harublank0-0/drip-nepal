import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import UserTransformer from '#transformers/user_transformer'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import ShopTransformer from '#transformers/shop_transformer'
import CartService from '#modules/orders/services/cart_service'
import { shopRegistrationOpen } from '#config/marketplace'

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  async share(ctx: HttpContext) {
    /**
     * The share method is called everytime an Inertia page is rendered. In
     * certain cases, a page may get rendered before the session middleware
     * or the auth middleware are executed. For example: During a 404 request.
     *
     * In that case, we must always assume that HttpContext is not fully hydrated
     * with all the properties
     */
    const { session, auth } = ctx as Partial<HttpContext>

    /**
     * Fetching the first error from the flash messages
     */
    const error = session?.flashMessages.get('error') as string
    const success = session?.flashMessages.get('success') as string

    /**
     * Data shared with all Inertia pages. Make sure you are using
     * transformers for rich data-types like Models.
     */
    const shopsQuery = (await auth?.user?.related('shops').query()) ?? []
    const shops = ShopTransformer.transform(shopsQuery)

    return {
      errors: ctx.inertia.always(this.getValidationErrors(ctx)),
      flash: ctx.inertia.always({
        error,
        success,
      }),
      user: ctx.inertia.always(
        auth?.user?.related('shops') ? UserTransformer.transform(auth.user) : undefined
      ),
      shops,
      /*
       * Number of items in the cart, for the navbar badge.
       */
      cartCount: auth?.user ? await new CartService().count(auth.user) : 0,
      /*
       * Shows the admin link in the navbar.
       */
      isAdmin: auth?.user ? await auth.user.isAdmin() : false,
      /*
       * Whether the storefront shows "open a shop" links (config/marketplace.ts).
       */
      shopRegistrationOpen,
      /*
       * The shop whose dashboard is open. Only set on routes that use the
       * `shopAccess` middleware.
       */
      currentShop: ctx.inertia.always(
        (ctx as Partial<HttpContext>).shop
          ? ShopTransformer.transform((ctx as HttpContext).shop)
          : undefined
      ),
    }
  }

  async handle(ctx: HttpContext, next: NextFn) {
    await this.init(ctx)

    const output = await next()
    this.dispose(ctx)

    return output
  }
}

declare module '@adonisjs/inertia/types' {
  type MiddlewareSharedProps = InferSharedProps<InertiaMiddleware>
  export interface SharedProps extends MiddlewareSharedProps {}
}

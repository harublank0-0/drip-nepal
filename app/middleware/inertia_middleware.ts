import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import UserTransformer from '#transformers/user_transformer'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import ShopTransformer from '#transformers/shop_transformer'
import CartService from '#modules/orders/services/cart_service'
import { guestToken } from '#modules/orders/customer'
import { shopRegistrationOpen } from '#config/marketplace'
import { appUrl, support } from '#config/storefront'

/*
 * The theme the visitor picked, from the `dn_theme` cookie the theme
 * toggle writes (inertia/components/providers/theme_provider.tsx).
 */
const THEMES = ['light', 'dark', 'system'] as const
type Theme = (typeof THEMES)[number]

function chosenTheme(ctx: HttpContext): Theme {
  const value = ctx.request.plainCookie('dn_theme', { encoded: false })
  return THEMES.includes(value) ? (value as Theme) : 'light'
}

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
      cartCount: await new CartService().count(
        auth?.user
          ? { userId: auth.user.id }
          : guestToken(session)
            ? { guestToken: guestToken(session)! }
            : null
      ),
      /*
       * Shows the admin link in the navbar.
       */
      isAdmin: auth?.user ? await auth.user.isAdmin() : false,
      /*
       * Whether the storefront shows "open a shop" links (config/marketplace.ts).
       */
      shopRegistrationOpen,
      /*
       * How customers reach the store, and the site's public address for
       * social previews (config/storefront.ts).
       */
      support,
      appUrl,
      /*
       * The saved theme, so the page renders the toggle in the right state.
       */
      theme: ctx.inertia.always(chosenTheme(ctx)),
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

    // The <html> class the page is sent with, so it paints in the saved
    // theme from the start. "system" is resolved in the browser by the
    // script in inertia_layout.edge.
    ctx.view.share({ themeClass: chosenTheme(ctx) === 'dark' ? 'dark' : 'light' })

    const output = await next()
    this.dispose(ctx)

    return output
  }
}

declare module '@adonisjs/inertia/types' {
  type MiddlewareSharedProps = InferSharedProps<InertiaMiddleware>
  export interface SharedProps extends MiddlewareSharedProps {}
}

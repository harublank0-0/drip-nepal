import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import { appUrl, support } from '#config/storefront'
import { parseTheme, THEME_COOKIE } from '#shared/ui/theme'

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
    const { session } = ctx as Partial<HttpContext>

    /**
     * Fetching the first error from the flash messages
     */
    const error = session?.flashMessages.get('error') as string
    const success = session?.flashMessages.get('success') as string

    /**
     * Data shared with all Inertia pages. The v1 store's account, shop and
     * cart props left with the v1 code on the E4 baseline branch; the
     * surfaces rebuilt in M1 to M4 add theirs (docs/08 §2).
     */
    return {
      errors: ctx.inertia.always(this.getValidationErrors(ctx)),
      flash: ctx.inertia.always({
        error,
        success,
      }),
      /*
       * How customers reach the store, and the site's public address for
       * social previews (config/storefront.ts).
       */
      support,
      appUrl,
      /*
       * The theme from the `dn_theme` cookie (docs/08 §1.2, docs/09 §13.10):
       * the root view writes its class on <html>, and ThemeProvider starts
       * from it, so the server markup and the first client render agree.
       */
      theme: parseTheme(ctx.request.plainCookie(THEME_COOKIE, { encoded: false })),
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

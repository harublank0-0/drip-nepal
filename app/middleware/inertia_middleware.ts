import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import { appUrl, support } from '#config/storefront'
import { encryptsHistory } from '#config/inertia'
import { parseTheme, THEME_COOKIE } from '#shared/ui/theme'
import { staffPermissions } from '#modules/identity/staff'
import { shopsOfUser } from '#modules/shops/queries'
import { currentShopJson, myShopJson } from '#transformers/seller/seller_context_transformer'

/*
 * The `seller_shops` rows of a signed-in user. Status pages render through
 * share() too, and a 500 page may report the database's own failure, so a
 * failed read leaves the prop null instead of failing that page as well;
 * the failure is logged by name, without the error's text.
 */
async function sellerShopsOf(ctx: HttpContext, userId: string) {
  try {
    const shops = await shopsOfUser(userId)
    return shops.map(myShopJson)
  } catch {
    ctx.logger.error({ event: 'inertia.seller_shops_failed' }, 'seller_shops could not be read')
    return null
  }
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
    const { session, auth, staff, shop } = ctx as Partial<HttpContext>

    /*
     * The history backstop of docs/07 §3.11 (T-SEC-043): every page
     * rendered without a signed-in user, `/login` included, clears the
     * browser's Inertia history, so a logout the client did not start (a
     * forced logout, a session revoked elsewhere) leaves no encrypted page
     * readable through Back. Harmless for guests, whose pages are not
     * encrypted. share() runs while the page object is built, before the
     * adapter reads the flag. Adapter 5 also puts `inertia.clear_history`
     * in the session, which the same render pulls again: a guest's render
     * then writes its session row instead of touching it, one statement
     * either way (docs/07 §3.1). A status page rendered before `silent_auth`
     * knew the user (a request refused earlier in the stack) counts too; for
     * a signed-in user that costs only a reload of encrypted history entries.
     */
    if (!auth?.user) ctx.inertia.clearHistory()

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
      /*
       * The signed-in user, or null (docs/09 §4.2): enough for the account
       * menu, nothing more.
       */
      user: auth?.user
        ? { id: auth.user.id, email: auth.user.email, full_name: auth.user.fullName }
        : null,
      /*
       * On admin pages, the staff member's role and the permissions it
       * grants (docs/09 §13.7, proposed `current_staff`), so the sidebar
       * hides what the role cannot use; null elsewhere. The UI hides, the
       * server decides (docs/08 §11.6). `platformStaff` sets `ctx.staff`
       * before the page renders.
       */
      current_staff: staff ? { role: staff.role, permissions: staffPermissions(staff.role) } : null,
      /*
       * For a signed-in user, the shops they own or are an active member
       * of (docs/03 §6.3; the rows of `listMyShops`): the seller layout's
       * shop switcher and the public header's "Your shop" link read it.
       * One small query per render, never a relation load (RF-44); null
       * for a guest, and when the read fails (`sellerShopsOf`).
       */
      seller_shops: auth?.user ? await sellerShopsOf(ctx, auth.user.id) : null,
      /*
       * On seller pages, the shop `seller_context` resolved, with the
       * caller's role and the permissions it holds (docs/09 §13.7), so the
       * sidebar hides what the role cannot use; null elsewhere.
       * `sellerContext` sets `ctx.shop` before the page renders.
       */
      current_shop: shop ? currentShopJson(shop) : null,
      // The reference support asks for (docs/08 §8.3).
      request_id: ctx.request.id() ?? null,
    }
  }

  async handle(ctx: HttpContext, next: NextFn) {
    await this.init(ctx)
    // The signed-in surfaces encrypt their history (config/inertia.ts, docs/07 §3.11).
    if (encryptsHistory(ctx.request.url())) ctx.inertia.encryptHistory()

    const output = await next()
    this.dispose(ctx)

    return output
  }
}

declare module '@adonisjs/inertia/types' {
  type MiddlewareSharedProps = InferSharedProps<InertiaMiddleware>
  export interface SharedProps extends MiddlewareSharedProps {}
}

import type { HttpContext } from '@adonisjs/core/http'
import { appUrl, mediaPublicUrl } from '#config/storefront'
import { mfaWithin } from '#middleware/platform_staff_middleware'
import { activeCategoryTree, newestListings } from '#modules/catalog/queries'
import { MFA_WINDOW_MS, activeStaffRole, staffMay } from '#modules/identity/staff'
import { listingPageCardJson } from '#transformers/catalog/storefront_transformer'

/*
 * `/`, the storefront home (docs/08 §2.2, §3.1; R1-S part 3d-iii-b-2),
 * which replaces in place the interim page of M1 part 3: server-rendered
 * in the storefront layout (ADR-0003), open to everyone, no `guest`
 * (T-UI-025). Every redirect after sign-in, after a verified link and away
 * from the guest pages still lands here.
 *
 * - `new_arrivals`: the newest listed products, in the listing pages'
 *   newest order (`newestListings`, one read without a count), at most
 *   `HOME_ARRIVALS`, in stock or not; none when nothing is listed, and the
 *   page leaves the row out.
 * - `categories`: the top-level categories the storefront lists.
 * - `admin_link`: true for an active staff member with TOTP enrolled whose
 *   role may open `/admin/logistics`, today's only admin page, and whose
 *   session holds MFA from the last 12 hours, as `platformStaff` requires,
 *   so the link never leads to the 403 page or the `/mfa` redirect (the UI
 *   hides, the server decides, docs/08 §11.6).
 * - `seo`: the canonical URL. Featured shops wait for other vendors.
 */
export const HOME_ARRIVALS = 8

export default class HomeController {
  async show(ctx: HttpContext) {
    const user = ctx.auth.user
    const role = user?.status === 'active' ? await activeStaffRole(user.id) : null
    const adminLink =
      role !== null && staffMay(role, 'platform.logistics.manage') && mfaWithin(ctx, MFA_WINDOW_MS)
    const rows = await newestListings(HOME_ARRIVALS)
    const tree = await activeCategoryTree()
    return ctx.inertia.render('storefront/home', {
      admin_link: adminLink,
      new_arrivals: rows.map((row) => listingPageCardJson(row, mediaPublicUrl)),
      categories: tree.map((node) => ({ slug: node.slug, name: node.name })),
      seo: { canonical: `${appUrl}/` },
    })
  }
}

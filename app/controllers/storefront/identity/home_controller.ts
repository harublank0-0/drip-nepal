import type { HttpContext } from '@adonisjs/core/http'
import { mfaWithin } from '#middleware/platform_staff_middleware'
import { MFA_WINDOW_MS, activeStaffRole, staffMay } from '#modules/identity/staff'

/*
 * `/`, the interim home page until M4 (docs/08 §2.2; not an OD, decided
 * 2026-11-23 by the tech lead, risks §2.3): every redirect after sign-in,
 * after a verified link and away from the guest pages lands on `/`, which
 * had no route before the storefront home. It renders `storefront/home`,
 * the component M4's home replaces in place, server-rendered in the
 * storefront layout (ADR-0003). Open to everyone; no `guest` (T-UI-025).
 *
 * Its one prop, `admin_link`, says whether to link the admin pages: true
 * for an active staff member with TOTP enrolled whose role may open
 * `/admin/logistics`, today's only admin page, and whose session holds MFA
 * from the last 12 hours, as `platformStaff` requires. So the link never
 * leads a role to the 403 page, nor a staff session without a fresh MFA
 * proof to the `/mfa` redirect (the UI hides, the server decides, docs/08
 * §11.6); `logIn` sends staff to `/mfa` before they get here (M1 part 5).
 * M4 moves the page to the catalog module's controller.
 */
export default class HomeController {
  async show(ctx: HttpContext) {
    const user = ctx.auth.user
    const role = user?.status === 'active' ? await activeStaffRole(user.id) : null
    const adminLink =
      role !== null && staffMay(role, 'platform.logistics.manage') && mfaWithin(ctx, MFA_WINDOW_MS)
    return ctx.inertia.render('storefront/home', { admin_link: adminLink })
  }
}

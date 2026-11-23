import type { HttpContext } from '@adonisjs/core/http'
import { assertShopGate, shopGateAllows, shopMay } from '#modules/shops/permissions'
import { acceptedCurrentAgreement, hasDefaultPickupAddress } from '#modules/shops/queries'

/*
 * The seller pages of docs/08 §2.5 built in R1-S part 1a: the overview,
 * `/seller/{shopSlug}`, behind `auth` then `seller_context` (T-SEC-005),
 * rendered in the browser in the seller layout (ADR-0003, config/inertia.ts)
 * with encrypted history (docs/07 §3.11). GET only (ADR-0004). Another
 * shop's slug, or one the caller is not in, is the 404 page of an unknown
 * slug (T-SEC-001). Each answer is never stored (`private, no-store`).
 * Routes in start/routes/seller.ts; 1b adds `/settings`, 1c `/shipping`.
 */
export default class ShopController {
  /*
   * The overview: gated as a `shop.member` route (docs/07 §4.4, as
   * `getSellerShop`). The heading reads the `current_shop` shared prop;
   * the page's one prop is `checklist`, the "before you can sell" items
   * read from real state, each only when the member meets the requirement
   * of the operation whose query feeds it and the shop passes that
   * operation's gate (docs/08 §2.5, 07 §4.5 "Page routes"):
   * - `seller_agreement`: the shop holds an agreement row for the current
   *   version (`getSellerShop`'s agreement status, any member), read alone,
   *   so the page reads no profile column it does not show;
   * - `pickup_address`: a default pickup address exists (the pickup
   *   addresses of `getLogisticsSettings`: `shop.shipping.manage`, shop
   *   `active`).
   * The profile (1b), shipping zones (1c) and products (part 2) join with
   * the parts that build them.
   */
  async overview(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'private, no-store')
    assertShopGate(ctx.shop, 'member')
    const checklist: { item: 'seller_agreement' | 'pickup_address'; done: boolean }[] = [
      { item: 'seller_agreement', done: await acceptedCurrentAgreement(ctx.shop.id) },
    ]
    if (shopMay(ctx.shop.actor, 'shop.shipping.manage') && shopGateAllows(ctx.shop, 'shipping')) {
      checklist.push({ item: 'pickup_address', done: await hasDefaultPickupAddress(ctx.shop.id) })
    }
    return ctx.inertia.render('seller/overview', { checklist })
  }
}

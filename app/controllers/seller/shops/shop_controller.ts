import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import {
  activeProvinces,
  deliveryAreas,
  placeNames,
  shippingConfigured,
} from '#modules/logistics/queries'
import { hasPublishedProduct } from '#modules/catalog/queries'
import { livePickupAddresses } from '#modules/shops/actions/pickup_addresses'
import { assertShopGate, shopGateAllows, shopMay } from '#modules/shops/permissions'
import {
  acceptedCurrentAgreement,
  hasDefaultPickupAddress,
  sellerShop,
  shopShippingState,
} from '#modules/shops/queries'
import { pickupAddressPlaceJson } from '#transformers/seller/logistics_transformer'
import { placeJson } from '#transformers/logistics/location_transformer'
import { deliveryAreasJson, shopShippingJson } from '#transformers/seller/shipping_transformer'
import { sellerShopJson } from '#transformers/seller/shop_transformer'

/*
 * The seller pages of docs/08 §2.5 built in R1-S parts 1a to 1c: the
 * overview, `/seller/{shopSlug}`, the settings, `/seller/{shopSlug}/
 * settings`, and the shipping, `/seller/{shopSlug}/shipping`, behind `auth`
 * then `seller_context` (T-SEC-005), rendered in the browser in the seller
 * layout (ADR-0003, config/inertia.ts) with encrypted history (docs/07
 * §3.11). GET only (ADR-0004). Another shop's slug, or one the caller is not
 * in, is the 404 page of an unknown slug (T-SEC-001). Each answer is never
 * stored (`private, no-store`). Routes in start/routes/seller.ts.
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
   * - `shipping_rates`: the shop's shipping is configured, the publish
   *   gate's condition (AC-FR-CAT-005-2: at least one covered district, and
   *   a rate for every covered zone; `getShopShipping`, any member; R1-S
   *   part 1c);
   * - `pickup_address`: a default pickup address exists (the pickup
   *   addresses of `getLogisticsSettings`: `shop.shipping.manage`, shop
   *   `active`);
   * - `product_live`: the shop has a `published` product
   *   (`listShopProducts`: `shop.products.view`, the `products_view` gate;
   *   R1-S part 2f-iii).
   * The profile adds no item: every column the law or the publish gate
   * needs is NOT NULL and set when the shop is created (04a §6.1), so it
   * cannot be missing.
   */
  async overview(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'private, no-store')
    assertShopGate(ctx.shop, 'member')
    const checklist: {
      item: 'seller_agreement' | 'shipping_rates' | 'pickup_address' | 'product_live'
      done: boolean
    }[] = [
      { item: 'seller_agreement', done: await acceptedCurrentAgreement(ctx.shop.id) },
      { item: 'shipping_rates', done: await shippingConfigured(ctx.shop.id) },
    ]
    if (shopMay(ctx.shop.actor, 'shop.shipping.manage') && shopGateAllows(ctx.shop, 'logistics')) {
      checklist.push({ item: 'pickup_address', done: await hasDefaultPickupAddress(ctx.shop.id) })
    }
    if (
      shopMay(ctx.shop.actor, 'shop.products.view') &&
      shopGateAllows(ctx.shop, 'products_view')
    ) {
      checklist.push({ item: 'product_live', done: await hasPublishedProduct(ctx.shop.id) })
    }
    return ctx.inertia.render('seller/overview', { checklist })
  }

  /*
   * The settings (docs/08 §2.5 `/settings`): gated as `getSellerShop`, the
   * operation that serves its main data, a `shop.member` route (07 §4.5
   * "Page routes"). Its one prop, `shop`, is `getSellerShop`'s answer for
   * this member through the same transformer, so the business details and
   * the grievance contact, its phone decrypted, reach the owner only
   * (AC-FR-SHOP-013-4, T-SEC-034) and are null for anyone else; `version`
   * is what the form sends as `If-Match`. Whether the form can be saved is
   * the `current_shop` permissions and the shared profile gate
   * (`profileEditable`), which the page reads; `updateShopProfile` decides.
   */
  async settings(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'private, no-store')
    assertShopGate(ctx.shop, 'member')
    const row = await sellerShop(ctx.shop.id)
    // `seller_context` has just found the shop; shops are never deleted while members remain.
    if (!row) throw new DomainError('NOT_FOUND')
    return ctx.inertia.render('seller/settings', { shop: sellerShopJson(row, ctx.shop.actor) })
  }

  /*
   * The shipping page (docs/08 §2.5 `/shipping`; R1-S part 1c): gated as
   * `getShopShipping`, the operation that serves its main data, a
   * `shop.member` route (07 §4.5 "Page routes"). Its props, each loaded
   * only when the member meets the requirement of the operation whose query
   * feeds it and the shop passes that operation's gate:
   * - `shipping`: `getShopShipping`'s answer through the same transformer
   *   (any member); its `version` is what the form sends as `If-Match`;
   * - `delivery_areas`: the zones and the active districts by province with
   *   their zones, public reference data the editor and the pickup form
   *   choose from (no operationId serves the district-to-zone map; 07 §4.5
   *   "Page routes");
   * - `pickup_addresses`: the live pickup addresses of
   *   `getLogisticsSettings`, with the contact phone in full as the shop's
   *   own data and the place names, and with them `provinces`, what
   *   `listProvinces` answers, the pickup form's first step (a pickup
   *   address takes any active district, as an address does, not only the
   *   delivery areas'); both only with `shop.shipping.manage` while the shop
   *   is `active` (the `logistics` gate), left out otherwise.
   * The rest of the Courier section (the logistics settings and the courier
   * accounts) comes with R1-S part 6. Whether the coverage form can be saved
   * is the `current_shop` permissions and the shared profile gate
   * (`profileEditable`), which the page reads; `replaceShopShipping`
   * decides.
   */
  async shipping(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'private, no-store')
    assertShopGate(ctx.shop, 'member')
    const state = await shopShippingState(ctx.shop.id)
    const areas = await deliveryAreas()
    const props = { shipping: shopShippingJson(state), delivery_areas: deliveryAreasJson(areas) }
    if (shopMay(ctx.shop.actor, 'shop.shipping.manage') && shopGateAllows(ctx.shop, 'logistics')) {
      const rows = await livePickupAddresses(ctx.shop.id)
      const names = await placeNames(rows.map((row) => row.local_level_code))
      const provinces = await activeProvinces()
      return ctx.inertia.render('seller/shipping', {
        ...props,
        pickup_addresses: rows.map((row) =>
          pickupAddressPlaceJson(row, names.get(row.local_level_code))
        ),
        provinces: provinces.map(placeJson),
      })
    }
    return ctx.inertia.render('seller/shipping', props)
  }
}

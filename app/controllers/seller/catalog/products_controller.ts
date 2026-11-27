import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import {
  LIST_PRODUCT_STATUSES,
  listShopProducts,
  productFormOptions,
  sellerProductData,
} from '#modules/catalog/queries'
import { variantStock } from '#modules/inventory/queries'
import { mediaPublicUrl } from '#config/storefront'
import { assertShopGate, assertShopPermission } from '#modules/shops/permissions'
import {
  productFormOptionsJson,
  sellerProductJson,
  sellerProductListItemJson,
} from '#transformers/seller/product_transformer'
import {
  listRequest,
  oneOf,
  pathWithoutRefused,
  textFilter,
  type ListRequest,
} from '#controllers/support/cursor'

/*
 * The seller product pages of docs/08 §2.5 (R1-S part 2f-i), behind `auth`
 * then `seller_context` (T-SEC-005), rendered in the browser in the seller
 * layout with encrypted history (docs/07 §3.11), never stored (`private,
 * no-store`). GET only (ADR-0004); the forms write through the JSON API.
 * Each page is gated as the operation that serves its main data (docs/07
 * §4.5 "Page routes"), and the props it adds are public reference data:
 *
 * - `/products` (`seller/products`), as `listShopProducts`
 *   (`shop.products.view`, `products_view`): one cursor page of the list
 *   with its `status` and `q` filters (06 §6.3). An unknown or malformed
 *   query parameter redirects to the page without it (08 §7.2).
 * - `/products/new` (`seller/product_new`), as its write, `createProduct`
 *   (`shop.products.edit`, `products_edit`), because every read is public
 *   (07 §4.5): the form's choices (`productFormOptions`).
 * - `/products/{productId}` (`seller/product_edit`), as `getShopProduct`
 *   (`shop.products.view`, `products_view`): the product as
 *   `getShopProduct` answers it, through the same transformer, and the
 *   form's choices, with the product's own category and brand kept. Another
 *   shop's product is the 404 page of a missing one (T-SEC-001). Whether
 *   the details can be saved is the `current_shop` permissions and the
 *   shared rules (`productEditable`, the `products_edit` gate), which the
 *   page reads; `updateProduct` decides.
 *
 * Routes in start/routes/seller.ts.
 */
const LIST_PARAMETERS = ['status', 'q'] as const

export default class ProductsController {
  async index(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'private, no-store')
    assertShopPermission(ctx.shop, 'shop.products.view')
    assertShopGate(ctx.shop, 'products_view')
    let status: (typeof LIST_PRODUCT_STATUSES)[number] | undefined
    let q: string | undefined
    let list: ListRequest
    try {
      status = oneOf(ctx, 'status', LIST_PRODUCT_STATUSES)
      q = textFilter(ctx, 'q', 100)
      list = listRequest(ctx, {
        sort: 'updated_desc',
        keyKind: 'timestamp',
        parameters: LIST_PARAMETERS,
        filters: { status, q },
      })
    } catch (error) {
      const path = pathWithoutRefused(ctx, error)
      if (path === null) throw error
      return ctx.response.redirect().toPath(path)
    }
    const result = await listShopProducts({
      shopId: ctx.shop.id,
      status,
      q,
      limit: list.limit,
      seek: list.seek,
    })
    return ctx.inertia.render('seller/products', {
      products: {
        items: result.items.map(sellerProductListItemJson),
        meta: list.meta(result.last),
      },
      filters: { status: status ?? null, q: q ?? null },
    })
  }

  async create(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'private, no-store')
    assertShopPermission(ctx.shop, 'shop.products.edit')
    assertShopGate(ctx.shop, 'products_edit')
    return ctx.inertia.render(
      'seller/product_new',
      productFormOptionsJson(await productFormOptions())
    )
  }

  async edit(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'private, no-store')
    assertShopPermission(ctx.shop, 'shop.products.view')
    assertShopGate(ctx.shop, 'products_view')
    const data = await sellerProductData(ctx.shop.id, ctx.params.productId)
    if (!data) throw new DomainError('NOT_FOUND')
    const stock = await variantStock(
      ctx.shop.id,
      data.variants.map((variant) => variant.id)
    )
    const options = await productFormOptions({
      keepCategoryId: data.product.categoryId,
      keepBrandId: data.product.brandId,
      keepAttributeCodes: [
        ...data.optionAxes,
        ...data.attributes.map((attribute) => attribute.code),
      ],
    })
    return ctx.inertia.render('seller/product_edit', {
      product: sellerProductJson(data, stock),
      ...productFormOptionsJson(options),
      // The public bucket's base URL, for the gallery's images built from their keys (R1-S part 2g-i).
      media_base: mediaPublicUrl,
    })
  }
}

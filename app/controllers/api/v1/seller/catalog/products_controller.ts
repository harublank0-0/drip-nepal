import type { HttpContext } from '@adonisjs/core/http'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { DomainError } from '#exceptions/domain_error'
import { updateProduct } from '#modules/catalog/actions/update_product'
import type { ProductFields } from '#modules/catalog/actions/product_draft'
import {
  LIST_PRODUCT_STATUSES,
  listShopProducts,
  sellerProductData,
  type ProductEditorData,
} from '#modules/catalog/queries'
import { createProduct } from '#modules/inventory/actions/create_product'
import { onHandOf } from '#modules/inventory/queries'
import { assertShopGate, assertShopPermission } from '#modules/shops/permissions'
import {
  sellerProductJson,
  sellerProductListItemJson,
} from '#transformers/seller/product_transformer'
import { closedQuery, invalidParameter, listRequest, oneOf } from '#controllers/support/cursor'
import {
  expectedVersion,
  idempotencyScope,
  sellerActor,
  sendIdempotent,
  setEtag,
} from '#controllers/support/http'
import {
  assertKnownItemMembers,
  assertKnownMembers,
  assertNotNull,
} from '#validators/support/strict_keys'
import {
  ATTRIBUTE_ITEM_MEMBERS,
  PRODUCT_MEMBERS,
  UPDATE_NOT_NULL_MEMBERS,
  createProductValidator,
  updateProductValidator,
} from '#validators/catalog/products'

/*
 * The seller's product drafts (docs/06 §13.5; 01 FR-CAT-003, FR-CAT-011;
 * R1-S part 2a). Routes in start/routes/api_v1/seller.ts, named by their
 * operationIds, behind `auth` and `seller_context`, which answers another
 * shop's slug with the 404 of an unknown one; a product of another shop is
 * the same 404 (T-SEC-001). Each checks its permission, then the status
 * gate of docs/07 §4.4: reads open while the shop is `active` or
 * `suspended`, writes while `active` only.
 *
 * - `listShopProducts` (`shop.products.view`): a cursor list (06 §6.2),
 *   newest change first; `status` (default: every product but the archived
 *   ones) and `q` (a title or SKU prefix, 1 to 100 characters).
 * - `getShopProduct` (`shop.products.view`): the editor view, with the
 *   product's `version` as a strong ETag (06 §8).
 * - `createProduct` ⚷ (`shop.products.edit`): 201 with `Location` and the
 *   ETag; a replay returns the stored answer with `Idempotency-Replayed`.
 * - `updateProduct` ⟳ (`shop.products.edit`): `If-Match` required (428
 *   when missing), 412 with `current` on a stale version.
 *
 * Unknown members, top-level or in an `attributes` item, are 422
 * `unknown_field` before the validator (T-SEC-003); no write takes a query
 * parameter (the validator reads the query and body merged).
 */
const LIST_PARAMETERS = ['status', 'q'] as const

function textFilter(ctx: HttpContext, name: string, max: number) {
  const value = ctx.request.qs()[name]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw invalidParameter(name, 'Send this parameter once.')
  const trimmed = value.trim()
  if (trimmed.length < 1 || [...trimmed].length > max) {
    throw invalidParameter(name, `Send 1 to ${max} characters.`)
  }
  return trimmed
}

export default class ProductsController {
  // The editor view with stock, inside a transaction when the action gives its client.
  private presenter(shopId: string) {
    return async (data: ProductEditorData, client: QueryClientContract) =>
      sellerProductJson(
        data,
        await onHandOf(
          shopId,
          data.variants.map((variant) => variant.id),
          client
        )
      )
  }

  // listShopProducts
  async index(ctx: HttpContext) {
    assertShopPermission(ctx.shop, 'shop.products.view')
    assertShopGate(ctx.shop, 'products_view')
    const status = oneOf(ctx, 'status', LIST_PRODUCT_STATUSES)
    const q = textFilter(ctx, 'q', 100)
    const list = listRequest(ctx, {
      sort: 'updated_desc',
      keyKind: 'timestamp',
      parameters: LIST_PARAMETERS,
      filters: { status, q },
    })
    const result = await listShopProducts({
      shopId: ctx.shop.id,
      status,
      q,
      limit: list.limit,
      seek: list.seek,
    })
    return { data: result.items.map(sellerProductListItemJson), meta: list.meta(result.last) }
  }

  // getShopProduct
  async show(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertShopPermission(ctx.shop, 'shop.products.view')
    assertShopGate(ctx.shop, 'products_view')
    const data = await sellerProductData(ctx.shop.id, ctx.params.productId)
    if (!data) throw new DomainError('NOT_FOUND')
    const onHand = await onHandOf(
      ctx.shop.id,
      data.variants.map((variant) => variant.id)
    )
    setEtag(ctx, data.product.version)
    return { data: sellerProductJson(data, onHand) }
  }

  // createProduct ⚷
  async store(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertShopPermission(ctx.shop, 'shop.products.edit')
    assertShopGate(ctx.shop, 'products_edit')
    const body = ctx.request.body()
    assertKnownMembers(body, PRODUCT_MEMBERS)
    assertKnownItemMembers(body, 'attributes', ATTRIBUTE_ITEM_MEMBERS)
    const input = await ctx.request.validateUsing(createProductValidator)
    const fields: ProductFields = {
      title: input.title,
      description: input.description,
      categoryId: input.category_id,
      brandId: input.brand_id ?? null,
      attributes: input.attributes.map((attribute) => ({
        code: attribute.attribute_code,
        valueCodes: attribute.value_codes,
      })),
      manufacturerName: input.manufacturer_name,
      isImported: input.is_imported,
      countryOfOrigin: input.country_of_origin,
      warrantyText: input.warranty_text,
      careAndPrecautions: input.care_and_precautions,
    }
    const presenter = this.presenter(ctx.shop.id)
    const result = await createProduct(fields, {
      shopId: ctx.shop.id,
      actor: sellerActor(ctx),
      idempotency: idempotencyScope(ctx, 'createProduct', input),
      present: async (data, client) => ({ data: await presenter(data, client) }),
    })
    const created = result.body.data
    ctx.response.header('Location', `/api/v1/seller/shops/${ctx.shop.slug}/products/${created.id}`)
    // 06 §7.5: a replay answers the stored body without a fresh ETag.
    if (!result.replayed) setEtag(ctx, created.version)
    return sendIdempotent(ctx, result)
  }

  // updateProduct ⟳
  async update(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertShopPermission(ctx.shop, 'shop.products.edit')
    assertShopGate(ctx.shop, 'products_edit')
    const body = ctx.request.body()
    assertKnownMembers(body, PRODUCT_MEMBERS)
    assertKnownItemMembers(body, 'attributes', ATTRIBUTE_ITEM_MEMBERS)
    assertNotNull(body, UPDATE_NOT_NULL_MEMBERS)
    const input = await ctx.request.validateUsing(updateProductValidator)
    const version = expectedVersion(ctx)
    const result = await updateProduct(
      {
        shopId: ctx.shop.id,
        productId: ctx.params.productId,
        expectedVersion: version,
        changes: {
          title: input.title,
          description: input.description,
          categoryId: input.category_id,
          brandId: input.brand_id,
          attributes: input.attributes?.map((attribute) => ({
            code: attribute.attribute_code,
            valueCodes: attribute.value_codes,
          })),
          manufacturerName: input.manufacturer_name,
          isImported: input.is_imported,
          countryOfOrigin: input.country_of_origin,
          warrantyText: input.warranty_text,
          careAndPrecautions: input.care_and_precautions,
        },
      },
      { actor: sellerActor(ctx), present: this.presenter(ctx.shop.id) }
    )
    setEtag(ctx, result.version)
    return { data: result.body }
  }
}

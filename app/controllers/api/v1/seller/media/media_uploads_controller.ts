import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { completeMediaUpload } from '#modules/media/actions/complete_media_upload'
import { createMediaUpload } from '#modules/media/actions/create_media_upload'
import { mediaUploadOf } from '#modules/media/queries'
import type { MediaKind } from '#modules/media/domain/media_kind'
import {
  assertShopGate,
  assertShopPermission,
  type ShopGate,
  type ShopPermission,
} from '#modules/shops/permissions'
import { mediaAssetJson, mediaUploadJson } from '#transformers/seller/media_transformer'
import { closedQuery } from '#controllers/support/cursor'
import { sellerActor } from '#controllers/support/http'
import { assertKnownMembers } from '#validators/support/strict_keys'
import {
  CREATE_MEDIA_UPLOAD_MEMBERS,
  createMediaUploadValidator,
} from '#validators/media/create_media_upload'

/*
 * The seller's uploads (docs/06 §13.5; 03 §7.5; ADR-0013; R1-S part 2d-i).
 * Routes in start/routes/api_v1/seller.ts, named by their operationIds,
 * behind `auth` and `seller_context`, which checks membership only: the
 * requirement is `mediaByKind` (07 §4.8). The kind's permission and status
 * gate apply once the kind is known, from the validated body (create) or
 * from the asset loaded inside the shop (complete, the state read). R1-S
 * offers `product_image` only (`shop.products.edit`, the "products edit,
 * publish; inventory" gate: `active`); another kind has no entry and is 403.
 *
 * - `createMediaUpload`: 201 with the presigned upload and `Location`, the
 *   asset that `getMediaUpload` reads (06 §3.7; R1-S part 2g-i).
 * - `completeMediaUpload`: 202 with the asset `processing`, or 200 with it
 *   `rejected` and the reason.
 * - `getMediaUpload`: 200 with the asset as it is now.
 *
 * Unknown body members are 422 `unknown_field` before the validator
 * (T-SEC-003); none takes a query parameter.
 */
const KIND_ACCESS: Partial<Record<MediaKind, { permission: ShopPermission; gate: ShopGate }>> = {
  product_image: { permission: 'shop.products.edit', gate: 'products_edit' },
}

function authorizeKind(ctx: HttpContext, kind: MediaKind) {
  const access = KIND_ACCESS[kind]
  if (!access) throw new DomainError('FORBIDDEN')
  assertShopPermission(ctx.shop, access.permission)
  assertShopGate(ctx.shop, access.gate)
}

export default class MediaUploadsController {
  // createMediaUpload
  async store(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertKnownMembers(ctx.request.body(), CREATE_MEDIA_UPLOAD_MEMBERS)
    const input = await ctx.request.validateUsing(createMediaUploadValidator)
    authorizeKind(ctx, input.kind)
    const result = await createMediaUpload(
      { shopId: ctx.shop.id, kind: input.kind, mime: input.mime, bytes: input.bytes },
      { actor: sellerActor(ctx) }
    )
    ctx.response.header(
      'Location',
      `/api/v1/seller/shops/${ctx.shop.slug}/media/${result.asset.id}`
    )
    return ctx.response.status(201).send({ data: mediaUploadJson(result) })
  }

  // completeMediaUpload
  async complete(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertKnownMembers(ctx.request.body(), [])
    const asset = await completeMediaUpload(
      { shopId: ctx.shop.id, mediaAssetId: ctx.params.mediaAssetId },
      { actor: sellerActor(ctx), authorize: (kind) => authorizeKind(ctx, kind) }
    )
    const status = asset.status === 'processing' ? 202 : 200
    return ctx.response.status(status).send({ data: mediaAssetJson(asset) })
  }

  /*
   * getMediaUpload: one upload's state, which the editor polls while the
   * worker processes it (docs/06 §2.1 "upload handshake"; R1-S part 2g-i).
   * The asset is looked up inside the shop, so another shop's is the 404 of
   * a missing one (T-SEC-001); then its kind's requirement applies, as for
   * `completeMediaUpload`. No query, no side effect.
   */
  async show(ctx: HttpContext) {
    closedQuery(ctx, [])
    const asset = await mediaUploadOf(ctx.shop.id, ctx.params.mediaAssetId)
    if (!asset) throw new DomainError('NOT_FOUND')
    authorizeKind(ctx, asset.kind)
    return { data: mediaAssetJson(asset) }
  }
}

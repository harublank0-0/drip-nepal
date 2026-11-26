import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { DomainError, VersionConflict, type ProblemErrorItem } from '#exceptions/domain_error'
import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { assertVariantsEditable } from '#modules/catalog/actions/product_variants'
import {
  productColorValueIds,
  productEditorData,
  shopProduct,
  type ProductEditorData,
} from '#modules/catalog/queries'
import { setProductMedia, type ProductMediaItem } from '#modules/media/actions/set_product_media'
import { shopProductImages } from '#modules/media/queries'
import type { Actor } from '#modules/platform/actor'
import { sendJob } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'

/*
 * `replaceProductMedia` ⟳ (docs/06 §13.5, §14.2; 01 FR-MED-002; 04a §7.14;
 * R1-S part 2d-iii): the whole ordered gallery of a product. The controller
 * has checked `shop.products.edit` and the status gate (an `active` shop).
 * In one transaction:
 *
 * 1. the product is locked inside the shop (another shop's product is 404,
 *    T-SEC-001); `pending_review`, `archived` and `blocked` are 409, as for
 *    `updateProduct`; a stale `If-Match` is 412 with `current`;
 * 2. the items are checked together, one 422 for all that fail: the
 *    positions are 1 to n with no gap or repeat, so position 1 is the
 *    primary image (AC-FR-MED-002-1); an asset appears once; a colour is a
 *    `color` value of one of the product's active variants (AC-FR-MED-002-3);
 *    a product that is `published` or `unpublished` keeps at least one image
 *    (AC-FR-MED-002-1); a draft may have none;
 * 3. every asset must be a product image of this shop, else 404 as a missing
 *    one (T-SEC-001 case (c)), and `ready`, else 422 `not_ready` (06 §13.5);
 * 4. a set equal to the current one writes nothing and keeps the version;
 *    otherwise `media.setProductMedia` replaces the rows, the product's
 *    version goes up (and a `rejected` product returns to `draft`, 05
 *    §6.10, AC-FR-CAT-006-2), one `product.media_replace` audit row
 *    (proposed) records the asset IDs before and after, never the alt text,
 *    and `catalog.refresh_listing` is sent.
 *
 * The answer is the editor view (`getShopProduct`) with the new version.
 */
export type ReplaceProductMediaCommand = {
  shopId: string
  productId: string
  expectedVersion: number
  items: ProductMediaItem[]
}

const LIVE = new Set(['published', 'unpublished'])

function itemProblems(
  items: ProductMediaItem[],
  status: string,
  colours: Set<string>
): ProblemErrorItem[] {
  const problems: ProblemErrorItem[] = []
  const positions = items.map((item) => item.position).sort((a, b) => a - b)
  if (positions.some((position, index) => position !== index + 1)) {
    problems.push({
      field: 'items',
      code: 'positions',
      message: 'Number the images 1, 2, 3 and so on, with no gap or repeat.',
    })
  }
  const seen = new Set<string>()
  items.forEach((item, index) => {
    if (seen.has(item.mediaAssetId)) {
      problems.push({
        field: `items.${index}.media_asset_id`,
        code: 'duplicate',
        message: 'This image is already in the list.',
      })
    }
    seen.add(item.mediaAssetId)
    if (item.colorValueId !== null && !colours.has(item.colorValueId)) {
      problems.push({
        field: `items.${index}.color_value_id`,
        code: 'not_allowed',
        message: 'Choose one of the colours this product is sold in.',
      })
    }
  })
  if (items.length === 0 && LIVE.has(status)) {
    problems.push({
      field: 'items',
      code: 'required',
      message: 'A product on sale needs at least one image.',
    })
  }
  return problems
}

const sameSet = (current: ProductEditorData['media'], next: ProductMediaItem[]) =>
  current.length === next.length &&
  [...next]
    .sort((a, b) => a.position - b.position)
    .every((item, index) => {
      const existing = current[index]
      return (
        existing.mediaAssetId === item.mediaAssetId &&
        existing.position === item.position &&
        existing.altText === item.altText &&
        existing.colorValueId === item.colorValueId
      )
    })

export async function replaceProductMedia<T>(
  command: ReplaceProductMediaCommand,
  context: {
    actor: Actor
    present: (data: ProductEditorData, client: QueryClientContract) => Promise<T>
  }
): Promise<{ body: T; version: number }> {
  return withTx(async (trx) => {
    const product = await shopProduct(trx, command.shopId, command.productId, { lock: true })
    if (!product) throw new DomainError('NOT_FOUND')
    assertVariantsEditable(product)
    const current = await productEditorData(trx, product)
    if (product.version !== command.expectedVersion) {
      throw new VersionConflict((await context.present(current, trx)) as Record<string, unknown>)
    }

    const assets = await shopProductImages(
      trx,
      command.shopId,
      command.items.map((item) => item.mediaAssetId)
    )
    if (command.items.some((item) => !assets.has(item.mediaAssetId))) {
      throw new DomainError('NOT_FOUND')
    }
    const colours = await productColorValueIds(trx, product.id)
    const problems = itemProblems(command.items, product.status, colours)
    command.items.forEach((item, index) => {
      if (assets.get(item.mediaAssetId) !== 'ready') {
        problems.push({
          field: `items.${index}.media_asset_id`,
          code: 'not_ready',
          message: 'This image is still being checked, or was refused. Use a ready image.',
        })
      }
    })
    if (problems.length > 0) throw new DomainError('VALIDATION_FAILED', { errors: problems })

    if (sameSet(current.media, command.items)) {
      return { body: await context.present(current, trx), version: product.version }
    }

    await setProductMedia(trx, { shopId: command.shopId, productId: product.id }, command.items)
    const [updated] = await trx
      .from('products')
      .where({ id: product.id, version: product.version, status: product.status })
      .update({
        ...(product.status === 'rejected' ? { status: 'draft' } : {}),
        version: trx.raw('version + 1'),
      })
      .returning('version')
    // The row is locked above, so the compare-and-set cannot miss it.
    if (!updated) throw new InvariantViolation('replaceProductMedia: the locked product changed')
    const byPosition = (list: { mediaAssetId: string; position: number }[]) =>
      [...list].sort((a, b) => a.position - b.position).map((item) => item.mediaAssetId)
    await recordAudit(trx, {
      actorType: context.actor.type,
      actorUserId: context.actor.userId,
      actorRole: context.actor.role,
      requestId: context.actor.requestId,
      ipHash: context.actor.ipHash ?? null,
      action: 'product.media_replace',
      subjectType: 'product',
      subjectId: product.id,
      shopId: product.shopId,
      changes: {
        media_asset_ids: { from: byPosition(current.media), to: byPosition(command.items) },
        ...(product.status === 'rejected' ? { status: { from: 'rejected', to: 'draft' } } : {}),
      },
    })
    await sendJob(trx, 'catalog.refresh_listing', {
      product_id: product.id,
      request_id: context.actor.requestId,
      causation_id: null,
    })
    const fresh = await shopProduct(trx, command.shopId, product.id)
    return {
      body: await context.present(await productEditorData(trx, fresh!), trx),
      version: updated.version as number,
    }
  })
}

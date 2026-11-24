import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { DomainError, VersionConflict } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import {
  applyVariantSet,
  assertVariantsEditable,
  planVariantSet,
  type VariantInput,
} from '#modules/catalog/actions/product_variants'
import {
  productEditorData,
  shopProduct,
  variantRowsFor,
  type ProductEditorData,
} from '#modules/catalog/queries'
import {
  deleteInventoryItems,
  lockInventoryItems,
} from '#modules/inventory/actions/close_inventory_items'
import { openInventoryItems } from '#modules/inventory/actions/open_inventory_items'
import { variantsWithHistory } from '#modules/inventory/queries'
import type { Actor } from '#modules/platform/actor'
import { sendJob } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'

/*
 * `replaceProductVariants` ⟳ (docs/06 §13.5, §14.2; 01 FR-CAT-004; docs/04a
 * §7.8–§7.10; R1-S part 2b), hosted in `inventory` because the transaction
 * opens and deletes stock rows (docs/09 §12.2 decision 2). The controller
 * has checked `shop.products.edit` and the status gate (an `active` shop).
 * In one transaction:
 *
 * 1. the product is locked inside the shop (another shop's product is 404,
 *    T-SEC-001); `pending_review`, `archived` and `blocked` are 409; a stale
 *    `If-Match` is 412 with `current`;
 * 2. the stock rows of its variants are locked (level 7 of 05 §4.4), then
 *    the variants with history (a movement or an order line) are read;
 * 3. `catalog.planVariantSet` validates the whole set (one 422, a 404 for a
 *    foreign variant ID, a 409 for new axes on a product with history);
 * 4. a set that changes nothing writes nothing and keeps the version;
 *    otherwise the stock rows of deleted variants go, `catalog.applyVariantSet`
 *    writes the axes, variants and option values, new variants get their
 *    stock rows at 0, one `product.variants_replace` audit row (proposed)
 *    records the axes and the counts (never a SKU, which a vendor may fill
 *    with anything), and `catalog.refresh_listing` is sent.
 *
 * The answer is the editor view (`getShopProduct`) with the new version.
 */
export type ReplaceProductVariantsCommand = {
  shopId: string
  productId: string
  expectedVersion: number
  optionAxes: string[]
  variants: VariantInput[]
}

export async function replaceProductVariants<T>(
  command: ReplaceProductVariantsCommand,
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

    const existing = await variantRowsFor(trx, product.id)
    const existingIds = existing.map((variant) => variant.id)
    await lockInventoryItems(trx, command.shopId, existingIds)
    const history = await variantsWithHistory(trx, existingIds)
    const plan = await planVariantSet(trx, {
      product,
      currentAxes: current.optionAxes,
      existing,
      history,
      optionAxes: command.optionAxes,
      variants: command.variants,
    })
    if (!plan.changed) {
      return { body: await context.present(current, trx), version: product.version }
    }

    await deleteInventoryItems(trx, command.shopId, plan.deleted)
    const applied = await applyVariantSet(trx, product, plan)
    await openInventoryItems(trx, command.shopId, applied.createdIds)
    const reactivated = plan.kept.filter((entry) => entry.existing.status !== 'active').length
    await recordAudit(trx, {
      actorType: context.actor.type,
      actorUserId: context.actor.userId,
      actorRole: context.actor.role,
      requestId: context.actor.requestId,
      ipHash: context.actor.ipHash ?? null,
      action: 'product.variants_replace',
      subjectType: 'product',
      subjectId: product.id,
      shopId: product.shopId,
      changes: {
        ...(plan.axes.change === 'none'
          ? {}
          : { option_axes: { from: plan.axes.from, to: plan.axes.to } }),
        created: plan.created.length,
        updated: plan.kept.filter((entry) => entry.changed).length - reactivated,
        reactivated,
        archived: plan.archived.length,
        deleted: plan.deleted.length,
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
      version: applied.version,
    }
  })
}

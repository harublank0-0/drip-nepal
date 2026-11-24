import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { insertProductDraft, type ProductFields } from '#modules/catalog/actions/product_draft'
import { productEditorData, shopProduct, type ProductEditorData } from '#modules/catalog/queries'
import { openInventoryItems } from '#modules/inventory/actions/open_inventory_items'
import type { Actor } from '#modules/platform/actor'
import { idempotentTx, type IdempotencyScope } from '#modules/platform/idempotency'
import { sendJob } from '#modules/platform/jobs'

/*
 * `createProduct` ⚷ (docs/06 §13.5, §14.2; 01 FR-CAT-003, AC-FR-CAT-003-3;
 * docs/09 §12.8; R1-S part 2a). Hosted in `inventory` because the
 * transaction also writes an `inventory_items` row, and `catalog` may not
 * import `inventory` (09 §12.2 decision 2). The controller has checked
 * `shop.products.edit` and the status gate (an `active` shop). In one
 * transaction, behind the idempotency key (the key row is its first
 * statement, 06 §7.3):
 *
 * 1. `catalog.insertProductDraft`: the checks that need other rows, then the
 *    `draft` product (`version` 1), its attribute values and its default
 *    variant;
 * 2. the default variant's `inventory_items` row at 0;
 * 3. one `product.create` audit row (proposed) with the status and the
 *    category (never the free text, which a vendor may fill with anything);
 * 4. `catalog.refresh_listing`, without a `singletonKey` (09 §12.2
 *    decision 3): a draft has no listing row, so the job writes nothing.
 *
 * The response is the editor view, stored with the key so a replay returns
 * it unchanged (06 §7.5). A failure anywhere rolls back the key, the rows
 * and the job together (T-CAT-001).
 */
export async function createProduct<T>(
  fields: ProductFields,
  context: {
    shopId: string
    actor: Actor
    idempotency: IdempotencyScope
    present: (data: ProductEditorData, client: QueryClientContract) => Promise<T>
  }
) {
  return idempotentTx(context.idempotency, async (trx) => {
    const draft = await insertProductDraft(trx, fields, {
      shopId: context.shopId,
      actorUserId: context.actor.userId!,
    })
    await openInventoryItems(trx, context.shopId, [draft.defaultVariantId])
    await recordAudit(trx, {
      actorType: context.actor.type,
      actorUserId: context.actor.userId,
      actorRole: context.actor.role,
      requestId: context.actor.requestId,
      ipHash: context.actor.ipHash ?? null,
      action: 'product.create',
      subjectType: 'product',
      subjectId: draft.productId,
      shopId: context.shopId,
      changes: {
        status: { from: null, to: 'draft' },
        category_id: { from: null, to: draft.category.id },
      },
    })
    await sendJob(trx, 'catalog.refresh_listing', {
      product_id: draft.productId,
      request_id: context.actor.requestId,
      causation_id: null,
    })
    const product = await shopProduct(trx, context.shopId, draft.productId)
    const data = await productEditorData(trx, product!)
    return { status: 201, body: await context.present(data, trx) }
  })
}

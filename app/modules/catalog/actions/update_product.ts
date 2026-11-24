import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { DomainError, InvalidStateTransition, VersionConflict } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import type { RuleProblem } from '#modules/catalog/domain/attribute_rules'
import { LIVE_STATUSES, liveDisclosureProblems } from '#modules/catalog/domain/disclosures'
import { productSlug } from '#modules/catalog/domain/identifiers'
import {
  checkProductFields,
  validationFailed,
  writeAttributeValues,
  type ProductFields,
} from '#modules/catalog/actions/product_draft'
import {
  effectiveRules,
  productEditorData,
  shopProduct,
  type ProductEditorData,
} from '#modules/catalog/queries'
import type { Actor } from '#modules/platform/actor'
import { sendJob } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'

/*
 * `updateProduct` ⟳ (docs/06 §13.5, §8; 01 FR-CAT-003, FR-CAT-011; docs/04a
 * §7.6, §7.7; R1-S part 2a), the catalog entry action. The controller has
 * checked `shop.products.edit` and the status gate (an `active` shop). In
 * one transaction:
 *
 * 1. the product is locked inside the shop (another shop's product is 404,
 *    T-SEC-001);
 * 2. a product in `pending_review`, `archived` or `blocked` is 409
 *    `INVALID_STATE_TRANSITION` (05 §6.10): a moderator approves the
 *    version they saw;
 * 3. ⟳: the locked `version` must equal the `If-Match` version, else 412
 *    `VERSION_CONFLICT` with `current` (06 §8);
 * 4. the given fields are merged over the stored ones, and the result is
 *    checked as `createProduct` checks a draft: the category, brand, origin
 *    and attribute rules. An absent `attributes` keeps the stored set, which
 *    is checked again against a new category. A new category must also
 *    allow the product's option axes. A product in `published` or
 *    `unpublished` must stay complete: every required attribute and every
 *    disclosure (T-CAT-105). All problems come in one 422;
 * 5. a request that changes nothing writes nothing and keeps the version;
 *    otherwise the row is updated (`slug` follows the title), `version + 1`,
 *    a `rejected` product returns to `draft` (status CAS, AC-FR-CAT-006-2),
 *    the attribute set is replaced when it changed, one `product.update`
 *    audit row (proposed) names the changed fields, and
 *    `catalog.refresh_listing` is sent (09 §12.2 decision 3).
 */
export type UpdateProductCommand = {
  shopId: string
  productId: string
  expectedVersion: number
  changes: Partial<ProductFields>
}

const EDITABLE = new Set(['draft', 'rejected', 'published', 'unpublished'])

const COLUMNS: Record<Exclude<keyof ProductFields, 'attributes'>, string> = {
  title: 'title',
  description: 'description',
  categoryId: 'category_id',
  brandId: 'brand_id',
  manufacturerName: 'manufacturer_name',
  isImported: 'is_imported',
  countryOfOrigin: 'country_of_origin',
  warrantyText: 'warranty_text',
  careAndPrecautions: 'care_and_precautions',
}

export async function updateProduct<T>(
  command: UpdateProductCommand,
  context: {
    actor: Actor
    present: (data: ProductEditorData, client: QueryClientContract) => Promise<T>
  }
): Promise<{ body: T; version: number }> {
  return withTx(async (trx) => {
    const product = await shopProduct(trx, command.shopId, command.productId, { lock: true })
    if (!product) throw new DomainError('NOT_FOUND')
    if (!EDITABLE.has(product.status)) {
      throw new InvalidStateTransition(
        product.status,
        product.status === 'archived' ? ['restore'] : []
      )
    }
    const current = await productEditorData(trx, product)
    if (product.version !== command.expectedVersion) {
      throw new VersionConflict((await context.present(current, trx)) as Record<string, unknown>)
    }

    const merged: ProductFields = {
      title: command.changes.title ?? product.title,
      description:
        command.changes.description === undefined
          ? product.description
          : command.changes.description,
      categoryId: command.changes.categoryId ?? product.categoryId,
      brandId: command.changes.brandId === undefined ? product.brandId : command.changes.brandId,
      attributes: command.changes.attributes ?? current.attributes,
      manufacturerName:
        command.changes.manufacturerName === undefined
          ? product.manufacturerName
          : command.changes.manufacturerName,
      isImported: command.changes.isImported ?? product.isImported,
      countryOfOrigin:
        command.changes.countryOfOrigin === undefined
          ? product.countryOfOrigin
          : command.changes.countryOfOrigin,
      warrantyText:
        command.changes.warrantyText === undefined
          ? product.warrantyText
          : command.changes.warrantyText,
      careAndPrecautions:
        command.changes.careAndPrecautions === undefined
          ? product.careAndPrecautions
          : command.changes.careAndPrecautions,
    }

    const live = LIVE_STATUSES.includes(product.status)
    const keptRows: { attribute_value_id: string }[] = await trx
      .from('product_attribute_values')
      .where('product_id', product.id)
      .select('attribute_value_id')
    const keptValueIds = new Set(keptRows.map((row) => row.attribute_value_id))
    const problems: RuleProblem[] = []
    let checked: Awaited<ReturnType<typeof checkProductFields>> | null = null
    try {
      checked = await checkProductFields(trx, merged, { complete: live, keptValueIds })
    } catch (error) {
      if (!(error instanceof DomainError) || error.problemCode !== 'VALIDATION_FAILED') throw error
      problems.push(...((error.options.errors ?? []) as RuleProblem[]))
    }
    if (checked && merged.categoryId !== product.categoryId && current.optionAxes.length > 0) {
      const rules = await effectiveRules(trx, checked.category.path)
      const refused = current.optionAxes.filter((code) => rules.get(code)?.usage !== 'variant_axis')
      if (refused.length > 0) {
        problems.push({
          field: 'category_id',
          code: 'axes_not_allowed',
          message: `This category does not vary by ${refused.join(' or ')}. Change the variants first.`,
        })
      }
    }
    if (live) problems.push(...liveDisclosureProblems(merged))
    if (problems.length > 0 || !checked) throw validationFailed(problems)

    const changed: string[] = []
    const update: Record<string, unknown> = {}
    for (const [field, column] of Object.entries(COLUMNS) as [
      Exclude<keyof ProductFields, 'attributes'>,
      string,
    ][]) {
      const stored = product[field as keyof typeof product]
      if (merged[field] !== stored) {
        changed.push(column)
        update[column] = merged[field]
      }
    }
    if (merged.title !== product.title) update.slug = productSlug(merged.title)
    const newValueIds = new Set(checked.values.map((value) => value.valueId))
    const attributesChanged =
      newValueIds.size !== keptValueIds.size || [...newValueIds].some((id) => !keptValueIds.has(id))
    if (attributesChanged) changed.push('attributes')

    if (changed.length === 0) {
      return { body: await context.present(current, trx), version: product.version }
    }

    const [row] = await trx
      .from('products')
      .where({ id: product.id, version: product.version, status: product.status })
      .update({
        ...update,
        ...(product.status === 'rejected' ? { status: 'draft' } : {}),
        version: trx.raw('version + 1'),
      })
      .returning('version')
    if (attributesChanged) {
      await writeAttributeValues(trx, { id: product.id, shopId: product.shopId }, checked.values)
    }
    await recordAudit(trx, {
      actorType: context.actor.type,
      actorUserId: context.actor.userId,
      actorRole: context.actor.role,
      requestId: context.actor.requestId,
      ipHash: context.actor.ipHash ?? null,
      action: 'product.update',
      subjectType: 'product',
      subjectId: product.id,
      shopId: product.shopId,
      changes: {
        changed,
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
      version: row.version as number,
    }
  })
}

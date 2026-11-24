import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError, InvalidStateTransition } from '#exceptions/domain_error'
import { InvariantViolation } from '#exceptions/programming_errors'
import type { EffectiveRule, RuleProblem } from '#modules/catalog/domain/attribute_rules'
import { LIVE_STATUSES } from '#modules/catalog/domain/disclosures'
import { optionSignature } from '#modules/catalog/domain/option_signature'
import { validationFailed } from '#modules/catalog/actions/product_draft'
import {
  attributeValuesOf,
  categoryRef,
  effectiveRules,
  type ProductRow,
} from '#modules/catalog/queries'

/*
 * The catalog steps of `replaceProductVariants` (docs/06 §13.5; docs/04
 * §3.4, §3.5, §3.7; docs/04a §7.8–§7.10; 01 FR-CAT-004; R1-S part 2b). The
 * entry action (`inventory.replaceProductVariants`) locks the product and
 * the stock rows, reads which variants have history (an inventory movement
 * or an order line), then calls `planVariantSet`, deletes the stock rows of
 * the variants the plan deletes, and calls `applyVariantSet`.
 */
export type VariantInput = {
  id?: string
  optionValueCodes: Record<string, string>
  sku: string
  priceMinor: number
  compareAtPriceMinor: number | null
  weightGrams: number | null
}

export type ExistingVariant = {
  id: string
  sku: string
  priceMinor: number
  compareAtPriceMinor: number | null
  weightGrams: number | null
  isDefault: boolean
  optionSignature: string
  status: string
  // Axis code → value code.
  codes: Record<string, string>
}

type ValueRef = { attributeId: string; valueId: string }

type Kept = {
  existing: ExistingVariant
  input: VariantInput
  signature: string
  values: ValueRef[]
  optionsChanged: boolean
  changed: boolean
}

type Created = { input: VariantInput; signature: string; values: ValueRef[] }

export type VariantPlan = {
  axes: { from: string[]; to: string[]; change: 'none' | 'reorder' | 'replace' }
  axisIds: Map<string, string>
  kept: Kept[]
  created: Created[]
  archived: string[]
  deleted: string[]
  changed: boolean
}

const EDITABLE = new Set(['draft', 'rejected', 'published', 'unpublished'])

// 409 for a product `pending_review`, `archived` or `blocked` (05 §6.10), as `updateProduct`.
export function assertVariantsEditable(product: ProductRow) {
  if (!EDITABLE.has(product.status)) {
    throw new InvalidStateTransition(
      product.status,
      product.status === 'archived' ? ['restore'] : []
    )
  }
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value) => b.includes(value))

/*
 * Validates the whole set and decides each variant's fate, writing nothing.
 * All problems come in one 422 (06 §5.1), except:
 * - an `id` that names no variant of this product: 404 `NOT_FOUND`, as for
 *   another shop's variant (T-SEC-001 case (c));
 * - a new axis set once a variant has history: 409 `CONFLICT` (axis set
 *   frozen, 04a §7.8). Reordering the same axes is always allowed.
 *
 * Rules (04a §7.9): each axis is an effective `variant_axis` rule of the
 * category; a live product keeps every required axis (04 §3.7 rule 4);
 * every entry gives exactly one value per axis, an active value or the one
 * the variant already has; no two entries share a combination or a SKU,
 * and no active variant of another product of the shop has the SKU; the
 * compare-at price is above the price; a live product's prices are above
 * zero (AC-FR-CAT-004-3); a variant with history keeps its options (it can
 * be repriced, renamed, archived or re-activated, never turned into
 * another variant). Existing active variants left out are deleted when they
 * have no history (their stock row first, by the caller) and archived
 * otherwise; archived ones left out stay archived, unless the axes are
 * replaced, when every variant left out is deleted (none has history then).
 */
export async function planVariantSet(
  trx: TransactionClientContract,
  input: {
    product: ProductRow
    currentAxes: string[]
    existing: ExistingVariant[]
    history: ReadonlySet<string>
    optionAxes: string[]
    variants: VariantInput[]
  }
): Promise<VariantPlan> {
  const { product, existing, history } = input
  const live = LIVE_STATUSES.includes(product.status)
  const problems: RuleProblem[] = []

  const category = await categoryRef(trx, product.categoryId)
  if (!category) throw new InvariantViolation('a product without its category')
  const rules = await effectiveRules(trx, category.path)
  const axisRules: EffectiveRule[] = []
  input.optionAxes.forEach((code, index) => {
    const rule = rules.get(code)
    if (!rule || rule.usage !== 'variant_axis') {
      problems.push({
        field: `option_axes.${index}`,
        code: 'not_allowed',
        message: 'This category does not offer this option.',
      })
    } else axisRules.push(rule)
  })
  if (live) {
    const missing = [...rules.values()]
      .filter((rule) => rule.usage === 'variant_axis' && rule.isRequired)
      .filter((rule) => !input.optionAxes.includes(rule.code))
      .map((rule) => rule.name)
    if (missing.length > 0) {
      problems.push({
        field: 'option_axes',
        code: 'required',
        message: `A live product in this category varies by ${missing.join(' and ')}.`,
      })
    }
  }

  const change = sameList(input.currentAxes, input.optionAxes)
    ? 'none'
    : sameSet(input.currentAxes, input.optionAxes)
      ? 'reorder'
      : 'replace'
  if (change === 'replace' && history.size > 0) {
    throw new DomainError('CONFLICT', {
      detail:
        'These options are fixed: a variant has been stocked or sold. Reorder them, or archive the product and create a new one.',
    })
  }

  const values = await attributeValuesOf(trx, input.optionAxes)
  const byId = new Map(existing.map((variant) => [variant.id, variant]))
  const seenIds = new Set<string>()
  const seenSignatures = new Map<string, number>()
  const seenSkus = new Map<string, number>()
  const kept: Kept[] = []
  const created: Created[] = []

  input.variants.forEach((entry, index) => {
    const path = `variants.${index}`
    const current = entry.id ? byId.get(entry.id) : undefined
    if (entry.id && !current) throw new DomainError('NOT_FOUND')
    if (entry.id) {
      if (seenIds.has(entry.id)) {
        problems.push({
          field: `${path}.id`,
          code: 'unique',
          message: 'This variant is listed twice.',
        })
      }
      seenIds.add(entry.id)
    }

    const given = Object.keys(entry.optionValueCodes)
    let signature = ''
    const valueRefs: ValueRef[] = []
    if (!sameSet(given, input.optionAxes)) {
      problems.push({
        field: `${path}.option_value_codes`,
        code: 'invalid',
        message:
          input.optionAxes.length === 0
            ? 'A product without options takes no option values.'
            : `Give one value for each option: ${input.optionAxes.join(', ')}.`,
      })
    } else {
      let valid = true
      for (const rule of axisRules) {
        const code = entry.optionValueCodes[rule.code]
        const value = values.get(rule.code)?.get(code)
        const already = current?.codes[rule.code] === code
        if (!value || (!value.isActive && !already)) {
          valid = false
          problems.push({
            field: `${path}.option_value_codes`,
            code: 'unknown_value',
            message: `Choose a ${rule.name.toLowerCase()} from the list.`,
          })
          break
        }
        valueRefs.push({ attributeId: rule.attributeId, valueId: value.id })
      }
      if (valid) {
        signature = optionSignature(entry.optionValueCodes)
        if (seenSignatures.has(signature)) {
          problems.push({
            field: `${path}.option_value_codes`,
            code: 'unique',
            message: 'Another variant has the same options.',
          })
        }
        seenSignatures.set(signature, index)
      }
    }
    if (seenSkus.has(entry.sku)) {
      problems.push({
        field: `${path}.sku`,
        code: 'unique',
        message: 'Another variant uses this SKU.',
      })
    }
    seenSkus.set(entry.sku, index)
    if (entry.compareAtPriceMinor !== null && entry.compareAtPriceMinor <= entry.priceMinor) {
      problems.push({
        field: `${path}.compare_at_price_minor`,
        code: 'invalid',
        message: 'The earlier price must be above the price.',
      })
    }
    if (live && entry.priceMinor <= 0) {
      problems.push({
        field: `${path}.price_minor`,
        code: 'required',
        message: 'A live product needs a price above zero.',
      })
    }

    if (current) {
      const optionsChanged = signature !== current.optionSignature || change === 'replace'
      if (optionsChanged && history.has(current.id)) {
        problems.push({
          field: `${path}.option_value_codes`,
          code: 'history',
          message:
            'This variant has been stocked or sold, so its options stay as they are. Add a new variant instead.',
        })
      }
      const changed =
        optionsChanged ||
        current.status !== 'active' ||
        current.sku !== entry.sku ||
        current.priceMinor !== entry.priceMinor ||
        current.compareAtPriceMinor !== entry.compareAtPriceMinor ||
        current.weightGrams !== entry.weightGrams
      kept.push({
        existing: current,
        input: entry,
        signature,
        values: valueRefs,
        optionsChanged,
        changed,
      })
    } else {
      created.push({ input: entry, signature, values: valueRefs })
    }
  })

  // A SKU stays unique per shop among active variants (`product_variants_shop_sku_key`).
  const skus = input.variants.map((entry) => entry.sku)
  const taken: { sku: string }[] = await trx
    .from('product_variants')
    .where({ shop_id: product.shopId, status: 'active' })
    .whereNot('product_id', product.id)
    .whereIn('sku', skus)
    .select('sku')
  for (const row of taken) {
    input.variants.forEach((entry, index) => {
      if (entry.sku === row.sku) {
        problems.push({
          field: `variants.${index}.sku`,
          code: 'unique',
          message: 'Another product of your shop uses this SKU.',
        })
      }
    })
  }
  if (problems.length > 0) throw validationFailed(problems)

  const leftOut = existing.filter((variant) => !seenIds.has(variant.id))
  const archived: string[] = []
  const deleted: string[] = []
  for (const variant of leftOut) {
    if (change === 'replace' || (variant.status === 'active' && !history.has(variant.id))) {
      deleted.push(variant.id)
    } else if (variant.status === 'active') {
      archived.push(variant.id)
    }
  }
  return {
    axes: { from: input.currentAxes, to: input.optionAxes, change },
    axisIds: new Map(axisRules.map((rule) => [rule.code, rule.attributeId])),
    kept,
    created,
    archived,
    deleted,
    changed:
      change !== 'none' ||
      created.length > 0 ||
      archived.length > 0 ||
      deleted.length > 0 ||
      kept.some((entry) => entry.changed),
  }
}

/*
 * Writes a plan, after the caller has deleted the stock rows of
 * `plan.deleted`. The order keeps the partial unique indexes on active
 * variants (`product_variants_shop_sku_key`,
 * `product_variants_product_signature_key`, `product_variants_default_key`)
 * satisfied after every statement: variants left out go first, then the
 * axes, then every kept variant whose SKU, options or status change is set
 * `archived` for a moment and written back `active` with its new values,
 * and new variants come last. Then the product: `version + 1`, and a
 * `rejected` product returns to `draft` (05 §6.10), by compare-and-set on
 * the version and status the lock read. Returns the new variants' IDs.
 */
export async function applyVariantSet(
  trx: TransactionClientContract,
  product: ProductRow,
  plan: VariantPlan
): Promise<{ createdIds: string[]; version: number }> {
  if (plan.archived.length > 0) {
    await trx
      .from('product_variants')
      .whereIn('id', plan.archived)
      .where('status', 'active')
      .update({ status: 'archived', version: trx.raw('version + 1') })
  }
  if (plan.deleted.length > 0) {
    // Their option values cascade (`variant_option_values_variant_fkey`, 04 §2.6).
    await trx.from('product_variants').whereIn('id', plan.deleted).delete()
  }

  const keptIds = plan.kept.map((entry) => entry.existing.id)
  if (plan.axes.change === 'replace') {
    if (keptIds.length > 0) {
      await trx.from('variant_option_values').whereIn('variant_id', keptIds).delete()
    }
    await trx.from('product_option_axes').where('product_id', product.id).delete()
    if (plan.axes.to.length > 0) {
      await trx.table('product_option_axes').multiInsert(
        plan.axes.to.map((code, index) => ({
          product_id: product.id,
          attribute_id: plan.axisIds.get(code)!,
          position: index + 1,
        }))
      )
    }
  } else if (plan.axes.change === 'reorder') {
    // One statement, so `product_option_axes_position_key` is checked at its end (04a §7.8).
    const [first, second] = plan.axes.to.map((code) => plan.axisIds.get(code)!)
    await trx.rawQuery(
      `UPDATE product_option_axes
          SET position = CASE attribute_id WHEN ? THEN 1 WHEN ? THEN 2 END
        WHERE product_id = ?`,
      [first, second, product.id]
    )
  }

  const rewritten = plan.kept.filter(
    (entry) =>
      entry.optionsChanged ||
      entry.existing.status !== 'active' ||
      entry.existing.sku !== entry.input.sku
  )
  const moving = rewritten
    .filter((entry) => entry.existing.status === 'active')
    .map((e) => e.existing.id)
  if (moving.length > 0) {
    await trx.from('product_variants').whereIn('id', moving).update({ status: 'archived' })
  }
  for (const entry of plan.kept) {
    if (!entry.changed) continue
    await trx
      .from('product_variants')
      .where('id', entry.existing.id)
      .update({
        sku: entry.input.sku,
        price_minor: entry.input.priceMinor,
        compare_at_price_minor: entry.input.compareAtPriceMinor,
        weight_grams: entry.input.weightGrams,
        option_signature: entry.signature,
        is_default: entry.signature === '',
        status: 'active',
        version: trx.raw('version + 1'),
      })
    if (entry.optionsChanged && plan.axes.change !== 'replace') {
      await trx.from('variant_option_values').where('variant_id', entry.existing.id).delete()
    }
    if (entry.optionsChanged && entry.values.length > 0) {
      await trx.table('variant_option_values').multiInsert(
        entry.values.map((value) => ({
          variant_id: entry.existing.id,
          product_id: product.id,
          attribute_id: value.attributeId,
          attribute_value_id: value.valueId,
        }))
      )
    }
  }

  const createdIds: string[] = []
  for (const entry of plan.created) {
    const [row] = await trx
      .table('product_variants')
      .insert({
        shop_id: product.shopId,
        product_id: product.id,
        sku: entry.input.sku,
        price_minor: entry.input.priceMinor,
        compare_at_price_minor: entry.input.compareAtPriceMinor,
        weight_grams: entry.input.weightGrams,
        currency: 'NPR',
        is_default: entry.signature === '',
        option_signature: entry.signature,
        status: 'active',
        version: 1,
      })
      .returning('id')
    createdIds.push(row.id as string)
    if (entry.values.length > 0) {
      await trx.table('variant_option_values').multiInsert(
        entry.values.map((value) => ({
          variant_id: row.id,
          product_id: product.id,
          attribute_id: value.attributeId,
          attribute_value_id: value.valueId,
        }))
      )
    }
  }

  const [updated] = await trx
    .from('products')
    .where({ id: product.id, version: product.version, status: product.status })
    .update({
      ...(product.status === 'rejected' ? { status: 'draft' } : {}),
      version: trx.raw('version + 1'),
    })
    .returning('version')
  // The row is locked by the caller, so the compare-and-set cannot miss it.
  if (!updated) throw new InvariantViolation('replaceProductVariants: the locked product changed')
  return { createdIds, version: updated.version as number }
}

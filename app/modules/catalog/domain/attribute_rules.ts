import type { AttributeInput } from '#modules/catalog/domain/attribute_input'
import type { CategoryAttributeUsage } from '#modules/catalog/domain/category_attribute_usage'

/*
 * The product attribute rules of docs/04 §3.7 (R1-S part 2a), as a pure
 * function over the leaf category's effective rules (the deepest row of the
 * path wins, docs/04a §7.4) and the values the request names
 * (T-CAT-104):
 *
 * 1. the attribute is an effective rule of the category with usage
 *    `product` (a variant axis is set through `replaceProductVariants`);
 * 2. a `single` attribute has at most one value;
 * 3. each value belongs to the attribute and is active, or is already on
 *    the product (an inactive value leaves the pickers, existing products
 *    keep it, 04a §7.3);
 * 4. only when `complete` (a product in `published` or `unpublished`):
 *    every required product attribute has a value. Drafts may be
 *    incomplete (AC-FR-CAT-002-2).
 *
 * Problems are 422 items on the request's paths (`attributes.N.attribute_code`,
 * `attributes.N.value_codes`, or `attributes` for a missing required one),
 * so the client handles one error shape.
 */
export type EffectiveRule = {
  attributeId: string
  code: string
  name: string
  input: AttributeInput
  usage: CategoryAttributeUsage
  isRequired: boolean
}

export type AttributeValueRef = { id: string; isActive: boolean }

export type AttributeRequest = { code: string; valueCodes: readonly string[] }

export type RuleProblem = { field: string; code: string; message: string }

export type ResolvedValue = { attributeId: string; valueId: string }

export function checkProductAttributes(input: {
  rules: ReadonlyMap<string, EffectiveRule>
  // Attribute code → value code → value.
  values: ReadonlyMap<string, ReadonlyMap<string, AttributeValueRef>>
  requested: readonly AttributeRequest[]
  // Value IDs already on the product, which may stay although inactive.
  kept?: ReadonlySet<string>
  complete: boolean
}): { resolved: ResolvedValue[]; problems: RuleProblem[] } {
  const resolved: ResolvedValue[] = []
  const problems: RuleProblem[] = []
  const given = new Set<string>()
  input.requested.forEach((request, index) => {
    const rule = input.rules.get(request.code)
    if (!rule || rule.usage !== 'product') {
      problems.push({
        field: `attributes.${index}.attribute_code`,
        code: 'not_allowed',
        message: 'This category does not use this attribute.',
      })
      return
    }
    if (rule.input === 'single' && request.valueCodes.length > 1) {
      problems.push({
        field: `attributes.${index}.value_codes`,
        code: 'too_many',
        message: `Choose one ${rule.name.toLowerCase()}.`,
      })
      return
    }
    const known = input.values.get(request.code)
    for (const code of request.valueCodes) {
      const value = known?.get(code)
      if (!value || (!value.isActive && !input.kept?.has(value.id))) {
        problems.push({
          field: `attributes.${index}.value_codes`,
          code: 'unknown_value',
          message: `Choose a ${rule.name.toLowerCase()} from the list.`,
        })
        return
      }
    }
    for (const code of request.valueCodes) {
      resolved.push({ attributeId: rule.attributeId, valueId: known!.get(code)!.id })
    }
    if (request.valueCodes.length > 0) given.add(request.code)
  })
  if (input.complete) {
    const missing = [...input.rules.values()]
      .filter((rule) => rule.usage === 'product' && rule.isRequired && !given.has(rule.code))
      .map((rule) => rule.name)
    if (missing.length > 0) {
      problems.push({
        field: 'attributes',
        code: 'required',
        message: `A live product needs: ${missing.join(', ')}.`,
      })
    }
  }
  return { resolved, problems }
}

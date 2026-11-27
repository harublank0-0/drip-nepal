import { VARIANT_LIMITS } from '../constants/limits.js'
import { minorToRupeesText, parseRupeesToMinor } from '../format/money.js'
import type { AttributeOption, CategoryOption, SellerProduct } from './product_details.js'

/*
 * The rules of the variant editor of `/seller/{shopSlug}/products/{productId}`
 * (docs/08 §2.5; 02 J-10 step 4; 01 FR-CAT-004; R1-S part 2f-ii) that need
 * no browser, so they are tested on their own (T-UI-043): which options a
 * product may vary by, the grid of combinations those options make, how a
 * row keeps what was typed and maps to an existing variant, the checks of
 * each row, the body of `replaceProductVariants` (docs/06 §13.5), and where
 * a server error lands.
 *
 * The request is the whole set (04a §7.9): every variant that should stay
 * active, an existing one by its `id`. A variant left out is deleted, or
 * archived when it has history (an inventory movement or an order line);
 * listing an archived variant's `id` makes it active again. So the grid
 * reuses the existing variant of each combination, an active one before an
 * archived one, and choosing an archived variant's options brings it back.
 * Once any variant has history the product's options are fixed (409
 * `CONFLICT` on a new set; reordering is allowed), and that variant's
 * options stay as they are.
 *
 * Money stays integer paisa (ADR-0007): prices are typed in rupees and read
 * with `parseRupeesToMinor`, never through a float.
 */
export type SellerVariant = SellerProduct['variants'][number]

export type AxisOption = { attribute: AttributeOption; required: boolean }

// One row of the grid: a combination, the variant it keeps (if any), and what was typed.
export type VariantRow = {
  // The combination's option signature (04a §7.9); `''` for the option-less variant.
  key: string
  codes: Record<string, string>
  // The existing variant this row keeps, active or archived; null for a new one.
  id: string | null
  archived: boolean
  hasHistory: boolean
  onHand: number
  sku: string
  // Rupees and grams as typed.
  price: string
  compareAt: string
  weight: string
}

export type VariantValues = {
  axes: string[]
  // Axis code → the chosen value codes.
  values: Record<string, string[]>
  rows: VariantRow[]
}

export type VariantBody = {
  option_axes: string[]
  variants: {
    id?: string
    option_value_codes: Record<string, string>
    sku: string
    price_minor: number
    compare_at_price_minor: number | null
    weight_grams: number | null
  }[]
}

/*
 * A combination's option signature: `attribute_code:value_code` pairs
 * sorted by attribute code and joined with `|`, `''` for none. The same text
 * as the server's `optionSignature` (04a §7.9), so reordering the axes
 * keeps every row.
 */
export function optionKey(codes: Readonly<Record<string, string>>) {
  return Object.entries(codes)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([attribute, value]) => `${attribute}:${value}`)
    .join('|')
}

// Whether any variant has history: then the product's options are fixed (04a §7.8).
export function axesLocked(product: SellerProduct) {
  return product.variants.some((variant) => variant.has_history)
}

/*
 * The options the product may vary by: the category's effective rules with
 * usage `variant_axis`, in the rules' order, then any axis the product
 * already has that the rules no longer name, which the server keeps (a
 * platform rule change never locks a product's variants).
 */
export function axisOptionsFor(
  category: CategoryOption | undefined,
  attributes: readonly AttributeOption[],
  product: SellerProduct
): AxisOption[] {
  const byCode = new Map(attributes.map((attribute) => [attribute.code, attribute]))
  const options: AxisOption[] = []
  for (const rule of category?.rules ?? []) {
    if (rule.usage !== 'variant_axis') continue
    const attribute = byCode.get(rule.attribute_code)
    if (attribute) options.push({ attribute, required: rule.is_required })
  }
  for (const code of product.option_axes) {
    const attribute = byCode.get(code)
    if (attribute && !options.some((option) => option.attribute.code === code)) {
      options.push({ attribute, required: false })
    }
  }
  return options
}

/*
 * The values offered for an axis: the active ones, and an inactive one only
 * while a variant of the product uses it, which the server accepts for that
 * variant (04a §7.3).
 */
export function offeredAxisValues(attribute: AttributeOption, product: SellerProduct) {
  const used = new Set(
    product.variants.flatMap((variant) => variant.option_value_codes[attribute.code] ?? [])
  )
  return attribute.values.filter((value) => value.is_active || used.has(value.code))
}

/*
 * The axes in the order they are sent: the product's own order for the axes
 * it keeps (a new order would only reorder them), then the others in the
 * order they were chosen.
 */
export function orderedAxes(chosen: readonly string[], product: SellerProduct) {
  const kept = product.option_axes.filter((code) => chosen.includes(code))
  return [...kept, ...chosen.filter((code) => !kept.includes(code))]
}

/*
 * Every combination of the chosen values, in axis order and, within an
 * axis, in the attribute's picker order; one empty combination for a
 * product without options.
 */
export function combinations(
  axes: readonly string[],
  values: Readonly<Record<string, readonly string[]>>,
  attributes: readonly AttributeOption[]
): Record<string, string>[] {
  let result: Record<string, string>[] = [{}]
  for (const axis of axes) {
    const attribute = attributes.find((candidate) => candidate.code === axis)
    const chosen = new Set(values[axis] ?? [])
    const ordered = (attribute?.values ?? [])
      .map((value) => value.code)
      .filter((code) => chosen.has(code))
    result = result.flatMap((codes) => ordered.map((code) => ({ ...codes, [axis]: code })))
  }
  return result
}

// The axes and values the saved active variants use, as the editor starts from them.
export function savedSelection(product: SellerProduct): Pick<VariantValues, 'axes' | 'values'> {
  const values: Record<string, string[]> = {}
  for (const axis of product.option_axes) {
    values[axis] = [
      ...new Set(
        product.variants
          .filter((variant) => variant.status === 'active')
          .flatMap((variant) => variant.option_value_codes[axis] ?? [])
      ),
    ]
  }
  return { axes: [...product.option_axes], values }
}

function rowFromVariant(variant: SellerVariant): VariantRow {
  return {
    key: optionKey(variant.option_value_codes),
    codes: { ...variant.option_value_codes },
    id: variant.id,
    archived: variant.status === 'archived',
    hasHistory: variant.has_history,
    onHand: variant.on_hand,
    sku: variant.sku,
    price: variant.price.amount_minor === 0 ? '' : minorToRupeesText(variant.price.amount_minor),
    compareAt: variant.compare_at_price
      ? minorToRupeesText(variant.compare_at_price.amount_minor)
      : '',
    weight: variant.weight_grams === null ? '' : String(variant.weight_grams),
  }
}

// The SKU of a new row: the product's base SKU and the row's value codes, unique in the grid.
function suggestedSku(base: string, codes: Record<string, string>, taken: ReadonlySet<string>) {
  const parts = [base, ...Object.values(codes).map((code) => code.toUpperCase())]
  const stem = parts.join('-').slice(0, VARIANT_LIMITS.sku.max)
  let sku = stem
  for (let suffix = 2; taken.has(sku); suffix++) {
    const tail = `-${suffix}`
    sku = `${stem.slice(0, VARIANT_LIMITS.sku.max - tail.length)}${tail}`
  }
  return sku
}

/*
 * The rows of the grid for `axes` and `values`, in combination order. A row
 * that `previous` already holds keeps what was typed in it; otherwise the
 * existing variant of the combination fills it (an active one before an
 * archived one); otherwise it is new, with a suggested SKU and the price,
 * compare-at price and weight of the product's first priced active variant,
 * so a seller adding sizes types the price once.
 */
export function buildRows(
  product: SellerProduct,
  axes: readonly string[],
  values: Readonly<Record<string, readonly string[]>>,
  attributes: readonly AttributeOption[],
  previous: readonly VariantRow[]
): VariantRow[] {
  const typed = new Map(previous.map((row) => [row.key, row]))
  const existing = new Map<string, SellerVariant>()
  for (const variant of product.variants) {
    const key = optionKey(variant.option_value_codes)
    const known = existing.get(key)
    if (!known || (known.status !== 'active' && variant.status === 'active')) {
      existing.set(key, variant)
    }
  }
  const template = product.variants.find(
    (variant) => variant.status === 'active' && variant.price.amount_minor > 0
  )
  const base =
    product.variants.find((variant) => variant.is_default)?.sku ?? `DN-${product.public_id}`
  // A retired value is the server's only for a variant that already has it (04a §7.3).
  const retired = (codes: Record<string, string>) =>
    Object.entries(codes).some(([axis, code]) =>
      attributes
        .find((attribute) => attribute.code === axis)
        ?.values.some((item) => item.code === code && !item.is_active)
    )
  // Each combination with the row it keeps: typed before, or filled from its variant. A new
  // combination with a retired value is left out, because the server would refuse it.
  const planned = combinations(axes, values, attributes).flatMap((codes) => {
    const key = optionKey(codes)
    const variant = existing.get(key)
    const row = typed.get(key) ?? (variant ? rowFromVariant(variant) : null)
    return !row && retired(codes) ? [] : [{ key, codes, row }]
  })
  const taken = new Set(planned.flatMap((entry) => (entry.row ? [entry.row.sku] : [])))
  return planned.map(({ key, codes, row }) => {
    if (row) return row
    const sku = suggestedSku(base, codes, taken)
    taken.add(sku)
    return {
      key,
      codes,
      id: null,
      archived: false,
      hasHistory: false,
      onHand: 0,
      sku,
      price: template ? minorToRupeesText(template.price.amount_minor) : '',
      compareAt: template?.compare_at_price
        ? minorToRupeesText(template.compare_at_price.amount_minor)
        : '',
      weight: template?.weight_grams ? String(template.weight_grams) : '',
    }
  })
}

/*
 * The values the editor starts from: the saved selection, and a row for
 * each active variant only, in combination order. A saved set need not be
 * the whole grid of its values (the API takes any combinations), so the
 * untouched form is the saved set and sends nothing; ticking or unticking a
 * value then builds the whole grid.
 */
export function variantValuesFrom(
  product: SellerProduct,
  attributes: readonly AttributeOption[]
): VariantValues {
  const selection = savedSelection(product)
  const active = new Set(
    product.variants
      .filter((variant) => variant.status === 'active')
      .map((variant) => optionKey(variant.option_value_codes))
  )
  return {
    ...selection,
    rows: buildRows(product, selection.axes, selection.values, attributes, []).filter((row) =>
      active.has(row.key)
    ),
  }
}

// A row problem, as a code the form turns into a message.
export type RowProblem =
  | 'sku_required'
  | 'sku_invalid'
  | 'sku_duplicate'
  | 'price_required'
  | 'price_invalid'
  | 'price_positive'
  | 'compare_at_invalid'
  | 'compare_at_not_above'
  | 'weight_invalid'

export function skuProblem(
  sku: string,
  rows: readonly VariantRow[],
  index: number
): RowProblem | null {
  const value = sku.trim()
  if (value === '') return 'sku_required'
  if (value.length > VARIANT_LIMITS.sku.max || !VARIANT_LIMITS.sku.pattern.test(value)) {
    return 'sku_invalid'
  }
  const first = rows.findIndex((row) => row.sku.trim() === value)
  return first !== index ? 'sku_duplicate' : null
}

// Rupees to paisa within the variant bounds, or null.
function paisa(typed: string) {
  const minor = parseRupeesToMinor(typed)
  return minor !== null && minor <= VARIANT_LIMITS.priceMinor.max ? minor : null
}

// A live product's prices are above zero (AC-FR-CAT-004-3); a draft's may be zero.
export function priceProblem(typed: string, live: boolean): RowProblem | null {
  if (typed.trim() === '') return 'price_required'
  const minor = paisa(typed)
  if (minor === null) return 'price_invalid'
  return live && minor === 0 ? 'price_positive' : null
}

// An optional earlier price, above the price (`product_variants_compare_at_check`).
export function compareAtProblem(typed: string, priceTyped: string): RowProblem | null {
  if (typed.trim() === '') return null
  const minor = paisa(typed)
  if (minor === null) return 'compare_at_invalid'
  const price = paisa(priceTyped)
  return price !== null && minor <= price ? 'compare_at_not_above' : null
}

export function weightProblem(typed: string): RowProblem | null {
  const value = typed.trim()
  if (value === '') return null
  if (!/^\d{1,5}$/.test(value)) return 'weight_invalid'
  const grams = Number(value)
  return grams < VARIANT_LIMITS.weightGrams.min || grams > VARIANT_LIMITS.weightGrams.max
    ? 'weight_invalid'
    : null
}

// The set problem, as a code: too many rows, or a live product without a required option.
export type SetProblem = 'too_many' | 'no_rows' | 'required_axis' | 'no_values'

export function setProblem(
  values: VariantValues,
  options: readonly AxisOption[],
  live: boolean
): SetProblem | null {
  if (values.axes.some((axis) => (values.values[axis] ?? []).length === 0)) return 'no_values'
  if (values.rows.length > VARIANT_LIMITS.variants.max) return 'too_many'
  // Every chosen combination is new and has a retired value, so no row can be sold.
  if (values.rows.length < VARIANT_LIMITS.variants.min) return 'no_rows'
  const missing = options.filter(
    (option) => option.required && !values.axes.includes(option.attribute.code)
  )
  return live && missing.length > 0 ? 'required_axis' : null
}

// The `replaceProductVariants` body for checked values: every row, in grid order.
export function variantsBody(values: VariantValues): VariantBody {
  return {
    option_axes: [...values.axes],
    variants: values.rows.map((row) => {
      const weight = row.weight.trim()
      const compareAt = row.compareAt.trim()
      return {
        ...(row.id ? { id: row.id } : {}),
        option_value_codes: { ...row.codes },
        sku: row.sku.trim(),
        price_minor: paisa(row.price) ?? 0,
        compare_at_price_minor: compareAt === '' ? null : (paisa(compareAt) ?? null),
        weight_grams: weight === '' ? null : Number(weight),
      }
    }),
  }
}

// What the saved active variants are, as `variantsBody` would send them.
function savedBody(product: SellerProduct): VariantBody {
  return {
    option_axes: [...product.option_axes],
    variants: product.variants
      .filter((variant) => variant.status === 'active')
      .map((variant) => ({
        id: variant.id,
        option_value_codes: { ...variant.option_value_codes },
        sku: variant.sku,
        price_minor: variant.price.amount_minor,
        compare_at_price_minor: variant.compare_at_price?.amount_minor ?? null,
        weight_grams: variant.weight_grams,
      })),
  }
}

/*
 * Whether `body` would change nothing: the same axes in the same order and
 * the same active variants with the same values, whatever their order. The
 * server writes nothing for such a set; the editor does not send it.
 */
export function sameAsSaved(body: VariantBody, product: SellerProduct) {
  const saved = savedBody(product)
  const canonical = (set: VariantBody) =>
    JSON.stringify({
      axes: set.option_axes,
      variants: set.variants
        .map((variant) => ({
          ...variant,
          option_value_codes: optionKey(variant.option_value_codes),
        }))
        .sort((a, b) => (a.option_value_codes < b.option_value_codes ? -1 : 1)),
    })
  return canonical(body) === canonical(saved)
}

/*
 * What a 412's `current` changed in the variants since `before` (docs/08
 * §7.1 "Concurrent edits"): the options (the axes or their order), the
 * variants (which ones are active, or a SKU, price, earlier price or
 * weight), in that order.
 */
export function variantConflictFields(before: SellerProduct, after: SellerProduct) {
  const was = savedBody(before)
  const now = savedBody(after)
  const changed: ('options' | 'variants')[] = []
  if (JSON.stringify(was.option_axes) !== JSON.stringify(now.option_axes)) changed.push('options')
  if (!sameAsSaved({ ...now, option_axes: was.option_axes }, before)) changed.push('variants')
  return changed
}

const ROW_MEMBERS: Record<string, keyof VariantRow> = {
  sku: 'sku',
  price_minor: 'price',
  compare_at_price_minor: 'compareAt',
  weight_grams: 'weight',
}

/*
 * Where a server error on `field` goes: a row member (`variants.N.sku`,
 * `.price_minor`, `.compare_at_price_minor`, `.weight_grams`) to that row's
 * field, by the index in the body sent, which is the grid's order; the
 * options (`option_axes`, `option_axes.N`) to the options field; anything
 * else (a combination, a variant listed twice, a variant with history whose
 * options changed, the database backstop `variants`) to the error summary.
 */
export function variantFieldOf(field: string | null, rowCount: number): string | null {
  if (field === null) return null
  if (field === 'option_axes' || /^option_axes\.\d+$/.test(field)) return 'axes'
  const match = /^variants\.(\d+)\.([a-z_]+)$/.exec(field)
  if (!match) return null
  const index = Number(match[1])
  const member = ROW_MEMBERS[match[2]]
  return member && index < rowCount ? `rows.${index}.${member}` : null
}

/*
 * The rules of the product details form of `/seller/{shopSlug}/products/new`
 * and `/seller/{shopSlug}/products/{productId}` (docs/08 §2.5; 01
 * FR-CAT-003, FR-CAT-007, FR-CAT-008, FR-CAT-012; R1-S part 2f-i) that need
 * no browser, so they are tested on their own (T-UI-042): which statuses
 * may be edited, the values the form starts from, the bodies of
 * `createProduct` and `updateProduct` (only the changed members are sent,
 * docs/06 §13.5), what a 412 changed, and where a server error lands.
 *
 * The form keeps text as typed and sends it trimmed, with an empty text
 * sent as null (the server clears a disclosure on null). Attributes are
 * kept by code, and only the product attributes of the chosen category are
 * sent (a value left over from another category would be refused with
 * `not_allowed`).
 */

// The statuses whose product the shop may edit (docs/05 §6.10): not under review, archived or blocked.
const EDITABLE = new Set(['draft', 'rejected', 'published', 'unpublished'])

/*
 * Whether a product in `status` may be edited (`updateProduct`,
 * `replaceProductVariants`, `replaceProductMedia`; docs/06 §13.5). The
 * actions' guard (`assertProductEditable`) and the editor, which shows the
 * form or the saved details, use this one rule.
 */
export function productEditable(status: string) {
  return EDITABLE.has(status)
}

// The statuses a product keeps every disclosure in (docs/04a §7.6 `products_disclosures_check`).
export const LIVE_PRODUCT_STATUSES: readonly string[] = ['published', 'unpublished']

export type AttributeRule = { attribute_code: string; usage: string; is_required: boolean }

export type CategoryOption = {
  id: string
  label: string
  is_active: boolean
  rules: AttributeRule[]
}

export type AttributeValueOption = {
  // The value's ID, which the gallery sends as `color_value_id` (R1-S part 2g-ii).
  id: string
  code: string
  label: string
  swatch_hex: string | null
  is_active: boolean
}

export type AttributeOption = {
  code: string
  name: string
  input: string
  values: AttributeValueOption[]
}

export type BrandOption = { id: string; name: string; requires_moderation: boolean }

type Money = { amount_minor: number; currency: string }

// `SellerProduct` (docs/06 §14.2): what `getShopProduct`, `createProduct` and `updateProduct` answer.
export type SellerProduct = {
  id: string
  public_id: string
  status: string
  version: number
  title: string
  description: string | null
  category: { id: string; path: string }
  brand: { id: string; name: string } | null
  attributes: { attribute_code: string; value_codes: string[] }[]
  manufacturer_name: string | null
  is_imported: boolean
  country_of_origin: string | null
  warranty_text: string | null
  care_and_precautions: string | null
  rejection_reason: string | null
  option_axes: string[]
  variants: {
    id: string
    sku: string
    label: string
    status: string
    price: Money
    compare_at_price: Money | null
    weight_grams: number | null
    is_default: boolean
    on_hand: number
    // Axis code → value code; empty for the option-less default variant (R1-S part 2f-ii).
    option_value_codes: Record<string, string>
    // An inventory movement or an order line: its options stay, the axes are fixed.
    has_history: boolean
  }[]
  media: {
    media_asset_id: string
    position: number
    alt_text: string | null
    color_value_id: string | null
    // The image's public derivatives by width (R1-S part 2g-i).
    keys: Record<string, string> | null
  }[]
  missing_for_submit: string[]
  updated_at: string
}

export type Origin = 'domestic' | 'imported'

export type DetailsValues = {
  title: string
  description: string
  category_id: string
  // '' is the shop's own label (no brand, docs/04 §3.10).
  brand_id: string
  // Attribute code → the chosen value codes.
  attributes: Record<string, string[]>
  manufacturer_name: string
  origin: Origin
  // '' until a country is chosen; never `NP` for an imported product.
  country_of_origin: string
  warranty_text: string
  care_and_precautions: string
}

// The members both operations take (docs/06 §13.5 `createProduct`).
export type DetailsBody = {
  title: string
  description: string | null
  category_id: string
  brand_id: string | null
  attributes: { attribute_code: string; value_codes: string[] }[]
  manufacturer_name: string | null
  is_imported: boolean
  country_of_origin: string | null
  warranty_text: string | null
  care_and_precautions: string | null
}

export const NEPAL = 'NP'

export function emptyDetails(): DetailsValues {
  return {
    title: '',
    description: '',
    category_id: '',
    brand_id: '',
    attributes: {},
    manufacturer_name: '',
    origin: 'domestic',
    country_of_origin: '',
    warranty_text: '',
    care_and_precautions: '',
  }
}

export function detailsFrom(product: SellerProduct): DetailsValues {
  return {
    title: product.title,
    description: product.description ?? '',
    category_id: product.category.id,
    brand_id: product.brand?.id ?? '',
    attributes: Object.fromEntries(
      product.attributes.map((attribute) => [attribute.attribute_code, [...attribute.value_codes]])
    ),
    manufacturer_name: product.manufacturer_name ?? '',
    origin: product.is_imported ? 'imported' : 'domestic',
    country_of_origin: product.is_imported ? (product.country_of_origin ?? '') : '',
    warranty_text: product.warranty_text ?? '',
    care_and_precautions: product.care_and_precautions ?? '',
  }
}

const trimmedOrNull = (value: string) => (value.trim() === '' ? null : value.trim())

/*
 * The product attributes the form shows for `category` (its effective rules
 * with usage `product`, in the rules' order), each with its attribute; a
 * rule naming an attribute the props do not hold is skipped.
 */
export function productAttributesFor(
  category: CategoryOption | undefined,
  attributes: readonly AttributeOption[]
): { attribute: AttributeOption; required: boolean }[] {
  if (!category) return []
  const byCode = new Map(attributes.map((attribute) => [attribute.code, attribute]))
  return category.rules
    .filter((rule) => rule.usage === 'product')
    .flatMap((rule) => {
      const attribute = byCode.get(rule.attribute_code)
      return attribute ? [{ attribute, required: rule.is_required }] : []
    })
}

/*
 * The attributes `product` holds values for that `category` does not use
 * (no product rule names them): values the category lost after they were
 * saved. The publication gate refuses them (06 §13.5 `publishProduct`), so
 * saving the details sends `attributes` while any is held, which removes
 * them (R1-S part 2f-iii).
 */
export function unusedAttributeCodes(
  product: Pick<SellerProduct, 'attributes'>,
  category: CategoryOption | undefined
): string[] {
  if (!category) return []
  const used = new Set(
    category.rules.filter((rule) => rule.usage === 'product').map((rule) => rule.attribute_code)
  )
  return product.attributes.map((item) => item.attribute_code).filter((code) => !used.has(code))
}

/*
 * The values offered for `attribute`: the active ones, and an inactive one
 * only while `saved` (the product's own values) holds it, because existing
 * products keep a retired value (docs/04a §7.3).
 */
export function offeredValues(attribute: AttributeOption, saved: readonly string[]) {
  return attribute.values.filter((value) => value.is_active || saved.includes(value.code))
}

/*
 * The `attributes` member for `values`: each product attribute of the
 * chosen category with at least one value, in the category's order, its
 * values in the attribute's picker order. Values of attributes the
 * category does not use are left out.
 */
export function attributesBody(
  values: DetailsValues,
  category: CategoryOption | undefined,
  attributes: readonly AttributeOption[]
): DetailsBody['attributes'] {
  return productAttributesFor(category, attributes).flatMap(({ attribute }) => {
    const chosen = new Set(values.attributes[attribute.code] ?? [])
    const codes = attribute.values.map((value) => value.code).filter((code) => chosen.has(code))
    return codes.length > 0 ? [{ attribute_code: attribute.code, value_codes: codes }] : []
  })
}

// The origin members: a domestic product names Nepal, an imported one the chosen country or none yet.
function originMembers(values: DetailsValues) {
  const imported = values.origin === 'imported'
  const country = values.country_of_origin.trim()
  return {
    is_imported: imported,
    country_of_origin: imported ? (country === '' || country === NEPAL ? null : country) : NEPAL,
  }
}

// The `createProduct` body for `values`.
export function createBody(
  values: DetailsValues,
  category: CategoryOption | undefined,
  attributes: readonly AttributeOption[]
): DetailsBody {
  return {
    title: values.title.trim(),
    description: trimmedOrNull(values.description),
    category_id: values.category_id,
    brand_id: values.brand_id === '' ? null : values.brand_id,
    attributes: attributesBody(values, category, attributes),
    manufacturer_name: trimmedOrNull(values.manufacturer_name),
    ...originMembers(values),
    warranty_text: trimmedOrNull(values.warranty_text),
    care_and_precautions: trimmedOrNull(values.care_and_precautions),
  }
}

// Two attribute lists hold the same values, whatever their order.
function sameAttributes(a: DetailsBody['attributes'], b: DetailsBody['attributes']) {
  const canonical = (list: DetailsBody['attributes']) =>
    JSON.stringify(
      list
        .map((item) => [item.attribute_code, [...item.value_codes].sort()] as const)
        .sort(([left], [right]) => left.localeCompare(right))
    )
  return canonical(a) === canonical(b)
}

/*
 * The members of `values` that differ from `product`, as the server stores
 * them, for `updateProduct`. `attributes` is sent whole when one of the
 * category's product attributes changes, and also when the category
 * changes, so values the new category does not use leave with it. While
 * the product holds values for an attribute its category no longer uses
 * (`unusedAttributeCodes`), every save sends `attributes` too, which
 * removes them; the attribute checks then run, as the server's do for what
 * is sent (R1-S part 2f-iii). `typedOnly` leaves that last case out: what
 * the user changed, for "save your changes first". The origin pair is sent
 * only when the product's origin changes, or an imported product's country
 * does: a domestic product saved with no country stays as it is.
 */
export function changedMembers(
  values: DetailsValues,
  product: SellerProduct,
  category: CategoryOption | undefined,
  attributes: readonly AttributeOption[],
  { typedOnly = false }: { typedOnly?: boolean } = {}
): Partial<DetailsBody> {
  const next = createBody(values, category, attributes)
  const body: Partial<DetailsBody> = {}
  if (next.title !== product.title) body.title = next.title
  if (next.description !== product.description) body.description = next.description
  if (next.category_id !== product.category.id) body.category_id = next.category_id
  if (next.brand_id !== (product.brand?.id ?? null)) body.brand_id = next.brand_id
  const saved = attributesBody(detailsFrom(product), category, attributes)
  if (
    body.category_id !== undefined ||
    !sameAttributes(next.attributes, saved) ||
    (!typedOnly && unusedAttributeCodes(product, category).length > 0)
  ) {
    body.attributes = next.attributes
  }
  if (next.manufacturer_name !== product.manufacturer_name) {
    body.manufacturer_name = next.manufacturer_name
  }
  const originChanged = next.is_imported !== product.is_imported
  if (originChanged || (next.is_imported && next.country_of_origin !== product.country_of_origin)) {
    body.is_imported = next.is_imported
    body.country_of_origin = next.country_of_origin
  }
  if (next.warranty_text !== product.warranty_text) body.warranty_text = next.warranty_text
  if (next.care_and_precautions !== product.care_and_precautions) {
    body.care_and_precautions = next.care_and_precautions
  }
  return body
}

// The form's fields, in its order: the 412 panel and the error summary list them this way.
export const DETAILS_FIELDS = [
  'title',
  'category_id',
  'brand_id',
  'attributes',
  'description',
  'manufacturer_name',
  'origin',
  'country_of_origin',
  'warranty_text',
  'care_and_precautions',
] as const

export type DetailsField = (typeof DETAILS_FIELDS)[number]

// The fields whose saved value differs between two readings of the product, in the form's order.
export function changedFields(before: SellerProduct, after: SellerProduct): DetailsField[] {
  const was = detailsFrom(before)
  const now = detailsFrom(after)
  return DETAILS_FIELDS.filter((name) => {
    if (name !== 'attributes') return was[name] !== now[name]
    const list = (values: DetailsValues) =>
      Object.entries(values.attributes).map(([code, codes]) => ({
        attribute_code: code,
        value_codes: codes,
      }))
    return !sameAttributes(list(was), list(now))
  })
}

/*
 * Where a server error on `field` goes in the form: a top-level member to
 * its field (`is_imported` to the origin choice), an attribute item
 * (`attributes.N.…`) to that attribute's field, found by its index in the
 * body that was sent (`sentCodes`), and anything else (a missing required
 * attribute, `attributes`, or a member the form does not show) to the
 * error summary (null).
 */
export function detailsFieldOf(field: string | null, sentCodes: readonly string[]): string | null {
  if (field === null) return null
  if (field === 'is_imported') return 'origin'
  const item = /^attributes\.(\d+)\.(attribute_code|value_codes)(?:\.\d+)?$/.exec(field)
  if (item) {
    const code = sentCodes[Number(item[1])]
    return code === undefined ? null : `attributes.${code}`
  }
  return (DETAILS_FIELDS as readonly string[]).includes(field) && field !== 'attributes'
    ? field
    : null
}

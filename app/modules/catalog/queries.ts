import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type { AttributeValueRef, EffectiveRule } from '#modules/catalog/domain/attribute_rules'
import type { AttributeInput } from '#modules/catalog/domain/attribute_input'
import type { CategoryAttributeUsage } from '#modules/catalog/domain/category_attribute_usage'
import { PRODUCT_STATUSES, type ProductStatus } from '#modules/catalog/domain/product_status'
import { withTx } from '#modules/platform/tx'
import { shopIdBySlug } from '#modules/shops/queries'
import type {
  FilterableAttribute,
  ListingColumn,
  ListingFilters,
} from '#modules/catalog/domain/listing_query'

/*
 * The catalog module's reads (docs/09 §2.2: its public surface is
 * `actions/`, `queries.ts` and `events.ts`; R1-S part 2a). Reads that a
 * transaction needs take its client; page and API reads use the pool.
 */

export type CategoryRef = { id: string; path: string; name: string }

// A cursor's last row: its sort key as RFC 3339 text, and its ID (docs/06 §6.2).
export type Seek = { key: string; id: string }

/*
 * The category a product may go in (docs/04 §3.6, T-CAT-101): active and a
 * leaf (no child category), or null.
 */
export async function activeLeafCategory(
  client: QueryClientContract,
  categoryId: string
): Promise<CategoryRef | null> {
  const row = await client
    .from('categories as c')
    .where('c.id', categoryId)
    .where('c.is_active', true)
    .whereNotExists((child) => {
      child.from('categories as k').whereColumn('k.parent_id', 'c.id')
    })
    .select('c.id', 'c.path', 'c.name')
    .first()
  return row ? { id: row.id, path: row.path, name: row.name } : null
}

/*
 * A leaf's effective attribute rules (docs/04 §3.7, docs/04a §7.4): the
 * rows on its path, the deepest row winning, keyed by attribute code.
 */
export async function effectiveRules(
  client: QueryClientContract,
  categoryPath: string
): Promise<Map<string, EffectiveRule>> {
  const result = await client.rawQuery(
    `SELECT DISTINCT ON (ca.attribute_id)
            ca.attribute_id, a.code, a.name, a.input, ca.usage, ca.is_required
       FROM category_attributes ca
       JOIN categories c ON c.id = ca.category_id
       JOIN attributes a ON a.id = ca.attribute_id
      WHERE ? LIKE c.path || '%'
      ORDER BY ca.attribute_id, c.depth DESC`,
    [categoryPath]
  )
  const rules = new Map<string, EffectiveRule>()
  for (const row of result.rows as {
    attribute_id: string
    code: string
    name: string
    input: AttributeInput
    usage: CategoryAttributeUsage
    is_required: boolean
  }[]) {
    rules.set(row.code, {
      attributeId: row.attribute_id,
      code: row.code,
      name: row.name,
      input: row.input,
      usage: row.usage,
      isRequired: row.is_required,
    })
  }
  return rules
}

// The values of the named attributes: attribute code → value code → value.
export async function attributeValuesOf(
  client: QueryClientContract,
  attributeCodes: readonly string[]
): Promise<Map<string, Map<string, AttributeValueRef>>> {
  const values = new Map<string, Map<string, AttributeValueRef>>()
  if (attributeCodes.length === 0) return values
  const rows: { attribute_code: string; code: string; id: string; is_active: boolean }[] =
    await client
      .from('attribute_values as v')
      .join('attributes as a', 'a.id', 'v.attribute_id')
      .whereIn('a.code', [...attributeCodes])
      .select('a.code as attribute_code', 'v.code', 'v.id', 'v.is_active')
  for (const row of rows) {
    const known = values.get(row.attribute_code) ?? new Map<string, AttributeValueRef>()
    known.set(row.code, { id: row.id, isActive: row.is_active })
    values.set(row.attribute_code, known)
  }
  return values
}

// The named attributes as rules of a kept axis (an axis the product already has).
export async function attributesByCode(
  client: QueryClientContract,
  codes: readonly string[]
): Promise<Map<string, EffectiveRule>> {
  if (codes.length === 0) return new Map()
  const rows: { id: string; code: string; name: string; input: AttributeInput }[] = await client
    .from('attributes')
    .whereIn('code', [...codes])
    .select('id', 'code', 'name', 'input')
  return new Map(
    rows.map((row) => [
      row.code,
      {
        attributeId: row.id,
        code: row.code,
        name: row.name,
        input: row.input,
        usage: 'variant_axis',
        isRequired: false,
      },
    ])
  )
}

/*
 * A brand a vendor may choose (docs/04a §7.5): `active` only, or null.
 * `requiresModeration` marks a watch-listed brand, whose products always
 * go through moderation (04 §3.10, AC-FR-CAT-008-3).
 */
export async function selectableBrand(
  client: QueryClientContract,
  brandId: string
): Promise<{ id: string; requiresModeration: boolean } | null> {
  const row = await client
    .from('brands')
    .where({ id: brandId, status: 'active' })
    .select('id', 'requires_moderation')
    .first()
  return row ? { id: row.id, requiresModeration: row.requires_moderation } : null
}

// A category as stored, active or not (an edit that keeps the category).
export async function categoryRef(
  client: QueryClientContract,
  categoryId: string
): Promise<CategoryRef | null> {
  const row = await client
    .from('categories')
    .where('id', categoryId)
    .select('id', 'path', 'name')
    .first()
  return row ? { id: row.id, path: row.path, name: row.name } : null
}

export type ProductRow = {
  id: string
  shopId: string
  publicId: string
  slug: string
  title: string
  description: string | null
  categoryId: string
  brandId: string | null
  manufacturerName: string | null
  isImported: boolean
  countryOfOrigin: string | null
  warrantyText: string | null
  careAndPrecautions: string | null
  status: ProductStatus
  rejectionReason: string | null
  version: number
  createdAt: Date
  updatedAt: Date
}

export type VariantRow = {
  id: string
  sku: string
  label: string
  priceMinor: number
  compareAtPriceMinor: number | null
  weightGrams: number | null
  isDefault: boolean
  status: string
  // Axis code → value code; empty for the option-less default variant (R1-S part 2f-ii).
  codes: Record<string, string>
}

export type ProductEditorData = {
  product: ProductRow
  category: CategoryRef
  brand: { id: string; name: string } | null
  attributes: { code: string; valueCodes: string[] }[]
  optionAxes: string[]
  variants: VariantRow[]
  media: {
    mediaAssetId: string
    position: number
    altText: string | null
    colorValueId: string | null
  }[]
  readyMediaCount: number
}

function productRow(row: Record<string, unknown>): ProductRow {
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    publicId: row.public_id as string,
    slug: row.slug as string,
    title: row.title as string,
    description: row.description as string | null,
    categoryId: row.category_id as string,
    brandId: row.brand_id as string | null,
    manufacturerName: row.manufacturer_name as string | null,
    isImported: row.is_imported as boolean,
    countryOfOrigin: row.country_of_origin as string | null,
    warrantyText: row.warranty_text as string | null,
    careAndPrecautions: row.care_and_precautions as string | null,
    status: row.status as ProductStatus,
    rejectionReason: row.rejection_reason as string | null,
    version: row.version as number,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  }
}

/*
 * A product of the shop, or null: another shop's product is null too, so
 * the caller answers the 404 of a missing one (T-SEC-001). `lock` takes the
 * row `FOR UPDATE` for an edit.
 */
export async function shopProduct(
  client: QueryClientContract,
  shopId: string,
  productId: string,
  options: { lock?: boolean } = {}
): Promise<ProductRow | null> {
  const query = client.from('products').where({ id: productId, shop_id: shopId })
  if (options.lock) query.forUpdate()
  const row = await query.first()
  return row ? productRow(row) : null
}

/*
 * Everything the editor shows of one product (docs/06 §13.5
 * `getShopProduct`, docs/09 §12.9), except stock, which belongs to
 * `inventory` and the caller adds. Variants are listed active first, then
 * by creation; each has its label: `Default` for the option-less variant,
 * else "Attribute: Value" per axis in axis order, joined by " / " (06
 * §14.2: `Size: M / Color: Black`).
 */
export async function productEditorData(
  client: QueryClientContract,
  product: ProductRow
): Promise<ProductEditorData> {
  const category = await client
    .from('categories')
    .where('id', product.categoryId)
    .select('id', 'path', 'name')
    .firstOrFail()
  const brand = product.brandId
    ? await client.from('brands').where('id', product.brandId).select('id', 'name').first()
    : null
  const attributeRows: { code: string; value_code: string }[] = await client
    .from('product_attribute_values as p')
    .join('attributes as a', 'a.id', 'p.attribute_id')
    .join('attribute_values as v', 'v.id', 'p.attribute_value_id')
    .where('p.product_id', product.id)
    .orderBy('a.position')
    .orderBy('a.code')
    .orderBy('v.position')
    .select('a.code', 'v.code as value_code')
  const attributes: { code: string; valueCodes: string[] }[] = []
  for (const row of attributeRows) {
    const last = attributes.at(-1)
    if (last?.code === row.code) last.valueCodes.push(row.value_code)
    else attributes.push({ code: row.code, valueCodes: [row.value_code] })
  }
  const axisRows: { code: string }[] = await client
    .from('product_option_axes as x')
    .join('attributes as a', 'a.id', 'x.attribute_id')
    .where('x.product_id', product.id)
    .orderBy('x.position')
    .select('a.code')
  const variantRows: Record<string, unknown>[] = await client
    .from('product_variants')
    .where('product_id', product.id)
    .orderByRaw("status = 'active' DESC")
    .orderBy('created_at')
    .orderBy('id')
    .select('*')
  const labels = await variantLabels(client, variantRows)
  const codeRows: { variant_id: string; attribute_code: string; value_code: string }[] =
    variantRows.length === 0
      ? []
      : await client
          .from('variant_option_values as o')
          .join('attributes as a', 'a.id', 'o.attribute_id')
          .join('attribute_values as v', 'v.id', 'o.attribute_value_id')
          .where('o.product_id', product.id)
          .select('o.variant_id', 'a.code as attribute_code', 'v.code as value_code')
  const codesOf = new Map<string, Record<string, string>>()
  for (const row of codeRows) {
    codesOf.set(row.variant_id, {
      ...codesOf.get(row.variant_id),
      [row.attribute_code]: row.value_code,
    })
  }
  const mediaRows: {
    media_asset_id: string
    position: number
    alt_text: string | null
    color_value_id: string | null
    status: string
  }[] = await client
    .from('product_media as m')
    .join('media_assets as a', 'a.id', 'm.media_asset_id')
    .where('m.product_id', product.id)
    .orderBy('m.position')
    .select('m.media_asset_id', 'm.position', 'm.alt_text', 'm.color_value_id', 'a.status')
  return {
    product,
    category: { id: category.id, path: category.path, name: category.name },
    brand: brand ? { id: brand.id, name: brand.name } : null,
    attributes,
    optionAxes: axisRows.map((row) => row.code),
    variants: variantRows.map((row) => {
      return {
        id: row.id as string,
        sku: row.sku as string,
        label: labels.get(row.id as string)!,
        priceMinor: row.price_minor as number,
        compareAtPriceMinor: row.compare_at_price_minor as number | null,
        weightGrams: row.weight_grams as number | null,
        isDefault: row.is_default as boolean,
        status: row.status as string,
        codes: codesOf.get(row.id as string) ?? {},
      }
    }),
    media: mediaRows.map((row) => ({
      mediaAssetId: row.media_asset_id,
      position: row.position,
      altText: row.alt_text,
      colorValueId: row.color_value_id,
    })),
    readyMediaCount: mediaRows.filter((row) => row.status === 'ready').length,
  }
}

/*
 * The label of each variant row, "Size: M / Colour: Black" in axis order,
 * or "Default" for the default variant: one query for any number of
 * products, so the editor and the stock list (`listInventory`) agree.
 */
async function variantLabels(
  client: QueryClientContract,
  rows: readonly Record<string, unknown>[]
): Promise<Map<string, string>> {
  const labelRows: { variant_id: string; name: string; label: string }[] =
    rows.length === 0
      ? []
      : await client
          .from('variant_option_values as o')
          .join('attribute_values as v', 'v.id', 'o.attribute_value_id')
          .join('product_option_axes as x', (join) => {
            join.on('x.product_id', 'o.product_id').andOn('x.attribute_id', 'o.attribute_id')
          })
          .whereIn(
            'o.variant_id',
            rows.map((row) => row.id as string)
          )
          .join('attributes as a', 'a.id', 'o.attribute_id')
          .orderBy('x.position')
          .select('o.variant_id', 'a.name', 'v.label')
  return new Map(
    rows.map((row) => [
      row.id as string,
      row.is_default
        ? 'Default'
        : labelRows
            .filter((label) => label.variant_id === row.id)
            .map((label) => `${label.name}: ${label.label}`)
            .join(' / '),
    ])
  )
}

export type ActiveVariant = { id: string; sku: string; label: string; isDefault: boolean }

/*
 * The active variants of the shop's products `productIds`, by product, in
 * the editor's order (creation, then ID), with their labels. `listInventory`
 * shows these (docs/06 §6.3, docs/04a §8.1).
 */
export async function activeVariantsOf(
  client: QueryClientContract,
  shopId: string,
  productIds: readonly string[]
): Promise<Map<string, ActiveVariant[]>> {
  if (productIds.length === 0) return new Map()
  const rows: Record<string, unknown>[] = await client
    .from('product_variants')
    .where('shop_id', shopId)
    .whereIn('product_id', [...productIds])
    .where('status', 'active')
    .orderBy('created_at')
    .orderBy('id')
    .select('id', 'product_id', 'sku', 'is_default')
  const labels = await variantLabels(client, rows)
  const byProduct = new Map<string, ActiveVariant[]>()
  for (const row of rows) {
    const list = byProduct.get(row.product_id as string) ?? []
    list.push({
      id: row.id as string,
      sku: row.sku as string,
      label: labels.get(row.id as string)!,
      isDefault: row.is_default as boolean,
    })
    byProduct.set(row.product_id as string, list)
  }
  return byProduct
}

/*
 * Every variant of a product, active and archived, with its option values
 * by axis code (R1-S part 2b, `replaceProductVariants`).
 */
export async function variantRowsFor(client: QueryClientContract, productId: string) {
  const rows: Record<string, unknown>[] = await client
    .from('product_variants')
    .where('product_id', productId)
    .orderBy('id')
    .select('*')
  const codes: { variant_id: string; attribute_code: string; value_code: string }[] =
    rows.length === 0
      ? []
      : await client
          .from('variant_option_values as o')
          .join('attributes as a', 'a.id', 'o.attribute_id')
          .join('attribute_values as v', 'v.id', 'o.attribute_value_id')
          .whereIn(
            'o.variant_id',
            rows.map((row) => row.id as string)
          )
          .select('o.variant_id', 'a.code as attribute_code', 'v.code as value_code')
  return rows.map((row) => ({
    id: row.id as string,
    sku: row.sku as string,
    priceMinor: row.price_minor as number,
    compareAtPriceMinor: row.compare_at_price_minor as number | null,
    weightGrams: row.weight_grams as number | null,
    isDefault: row.is_default as boolean,
    optionSignature: row.option_signature as string,
    status: row.status as string,
    codes: Object.fromEntries(
      codes
        .filter((code) => code.variant_id === row.id)
        .map((code) => [code.attribute_code, code.value_code])
    ) as Record<string, string>,
  }))
}

// `getShopProduct`: the editor data of a product of the shop, or null (another shop's is null too).
export async function sellerProductData(shopId: string, productId: string) {
  const client = db.connection()
  const product = await shopProduct(client, shopId, productId)
  return product ? productEditorData(client, product) : null
}

export type ProductListItem = {
  id: string
  publicId: string
  title: string
  status: ProductStatus
  version: number
  variantCount: number
  updatedAt: Date
}

/*
 * The seller product list (docs/06 §13.5 `listShopProducts`, §6.2, §6.3):
 * newest change first, by the cursor `(updated_at, id) < (:k0, :k1)`.
 * Without `status` every product but the archived ones; `q` matches a title
 * prefix (case-insensitive) or a SKU prefix of any variant. `variantCount`
 * counts active variants. A `status` filter reads `products_seller_list_idx`
 * in order; the default list reads the shop's rows through its `shop_id`
 * prefix and sorts them, a few hundred at A-03 scale (04a §7.6).
 */
export async function listShopProducts(filters: {
  shopId: string
  status?: ProductStatus
  q?: string
  limit: number
  seek: Seek | null
}) {
  const query = db
    .from('products as p')
    .where('p.shop_id', filters.shopId)
    .select('p.id', 'p.public_id', 'p.title', 'p.status', 'p.version', 'p.updated_at')
    .select(
      db.raw(
        `to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as sort_key`
      )
    )
    .select(
      db.raw(
        `(SELECT count(*)::int FROM product_variants v
           WHERE v.product_id = p.id AND v.status = 'active') AS variant_count`
      )
    )
    .orderBy('p.updated_at', 'desc')
    .orderBy('p.id', 'desc')
    .limit(filters.limit + 1)
  if (filters.status) query.where('p.status', filters.status)
  else query.whereNot('p.status', 'archived')
  if (filters.q) {
    const prefix = `${filters.q.replaceAll(/[\\%_]/g, (char) => `\\${char}`)}%`
    query.where((match) => {
      match.whereILike('p.title', prefix).orWhereExists((variant) => {
        variant
          .from('product_variants as s')
          .whereColumn('s.product_id', 'p.id')
          .whereILike('s.sku', prefix)
      })
    })
  }
  if (filters.seek) {
    query.whereRaw('(p.updated_at, p.id) < (?::timestamptz, ?::uuid)', [
      filters.seek.key,
      filters.seek.id,
    ])
  }
  const rows = await query
  const items: ProductListItem[] = rows.slice(0, filters.limit).map((row) => ({
    id: row.id,
    publicId: row.public_id,
    title: row.title,
    status: row.status,
    version: row.version,
    variantCount: row.variant_count,
    updatedAt: row.updated_at,
  }))
  const last = rows.length > filters.limit ? rows[filters.limit - 1] : null
  return { items, last: last ? { key: last.sort_key as string, id: last.id as string } : null }
}

export const LIST_PRODUCT_STATUSES: readonly ProductStatus[] = PRODUCT_STATUSES

/*
 * The `color` values of a product's active variants (04 §3.9): the only
 * colours `replaceProductMedia` may link an image to (AC-FR-MED-002-3).
 */
export async function productColorValueIds(
  client: QueryClientContract,
  productId: string
): Promise<Set<string>> {
  const rows: { attribute_value_id: string }[] = await client
    .from('variant_option_values as o')
    .join('attributes as a', 'a.id', 'o.attribute_id')
    .join('product_variants as v', 'v.id', 'o.variant_id')
    .where({ 'o.product_id': productId, 'a.code': 'color', 'v.status': 'active' })
    .distinct('o.attribute_value_id')
  return new Set(rows.map((row) => row.attribute_value_id))
}

export type CategoryOption = {
  id: string
  // The names from the top level down: ['Clothing', 'Tops', 'T-Shirts'].
  names: string[]
  isActive: boolean
  rules: { code: string; usage: CategoryAttributeUsage; isRequired: boolean }[]
}

export type AttributeOption = {
  code: string
  name: string
  input: AttributeInput
  values: { code: string; label: string; swatchHex: string | null; isActive: boolean }[]
}

export type BrandOption = { id: string; name: string; requiresModeration: boolean }

export type ProductFormOptions = {
  categories: CategoryOption[]
  attributes: AttributeOption[]
  brands: BrandOption[]
}

/*
 * What the product form chooses from (docs/08 §2.5 `/products/new` and
 * `/products/{productId}`; R1-S part 2f-i): public reference data, as page
 * props. `listCategories` and `listAttributes` serve the storefront, without
 * the rules' `usage` and `is_required` that the form needs (07 note 68).
 *
 * - `categories`: the leaves a product may go in (`activeLeafCategory`:
 *   active, no child), in tree order, each with its names from the top
 *   level down and its effective attribute rules, the deepest row of its
 *   path winning by the same comparison as `effectiveRules`, so the form
 *   offers what the actions accept. `keepCategoryId`, the product's own
 *   category, is listed even when it is no longer an active leaf
 *   (`isActive` false), so an edit can keep it (04a §7.1).
 * - `attributes`: the attributes any listed rule names, and `keepAxisCodes`,
 *   the product's own axes, which the server keeps when no rule names them
 *   any more (R1-S part 2f-ii), each with every value in picker order; an
 *   inactive value is marked, so the form offers it only to a product that
 *   already has it (04a §7.3).
 * - `brands`: the `active` brands by name (04a §7.5), and `keepBrandId`, the
 *   product's own brand, whatever its status.
 */
export async function productFormOptions(
  options: {
    keepCategoryId?: string
    keepBrandId?: string | null
    keepAxisCodes?: readonly string[]
  } = {}
): Promise<ProductFormOptions> {
  const client = db.connection()
  const rows: {
    id: string
    parent_id: string | null
    name: string
    position: number
    is_active: boolean
    has_child: boolean
  }[] = await client
    .from('categories as c')
    .select('c.id', 'c.parent_id', 'c.name', 'c.position', 'c.is_active')
    .select(client.raw('EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id) AS has_child'))
  const byId = new Map(rows.map((row) => [row.id, row]))
  // The chain from the top level down, for the names and the tree order.
  const chain = (row: (typeof rows)[number]) => {
    const list = [row]
    for (let at = row; at.parent_id !== null; ) {
      const parent = byId.get(at.parent_id)
      if (!parent) break
      list.unshift(parent)
      at = parent
    }
    return list
  }
  const leaves = rows
    .filter((row) => (row.is_active && !row.has_child) || row.id === options.keepCategoryId)
    .map((row) => ({ row, path: chain(row) }))
    .sort((a, b) => {
      for (let index = 0; index < Math.min(a.path.length, b.path.length); index++) {
        const left = a.path[index]
        const right = b.path[index]
        if (left.id === right.id) continue
        return left.position - right.position || left.name.localeCompare(right.name)
      }
      return a.path.length - b.path.length
    })
  const leafIds = leaves.map((leaf) => leaf.row.id)
  type RuleRow = {
    category_id: string
    code: string
    usage: CategoryAttributeUsage
    is_required: boolean
    attribute_position: number
  }
  // The same comparison as `effectiveRules`: the rows on each leaf's path, the deepest winning.
  const ruleResult =
    leafIds.length === 0
      ? { rows: [] }
      : await client.rawQuery(
          `SELECT DISTINCT ON (leaf.id, ca.attribute_id)
                  leaf.id AS category_id, a.code, ca.usage, ca.is_required,
                  a.position AS attribute_position
             FROM categories leaf
             JOIN categories c ON leaf.path LIKE c.path || '%'
             JOIN category_attributes ca ON ca.category_id = c.id
             JOIN attributes a ON a.id = ca.attribute_id
            WHERE leaf.id = ANY(?::uuid[])
            ORDER BY leaf.id, ca.attribute_id, c.depth DESC`,
          [leafIds]
        )
  const ruleRows = ruleResult.rows as RuleRow[]
  const rulesOf = new Map<string, typeof ruleRows>()
  for (const rule of ruleRows) {
    const list = rulesOf.get(rule.category_id) ?? []
    list.push(rule)
    rulesOf.set(rule.category_id, list)
  }
  const codes = [
    ...new Set([...ruleRows.map((rule) => rule.code), ...(options.keepAxisCodes ?? [])]),
  ]
  const attributeRows: { code: string; name: string; input: AttributeInput }[] =
    codes.length === 0
      ? []
      : await client
          .from('attributes')
          .whereIn('code', codes)
          .orderBy('position')
          .orderBy('code')
          .select('code', 'name', 'input')
  const valueRows: {
    attribute_code: string
    code: string
    label: string
    swatch_hex: string | null
    is_active: boolean
  }[] =
    codes.length === 0
      ? []
      : await client
          .from('attribute_values as v')
          .join('attributes as a', 'a.id', 'v.attribute_id')
          .whereIn('a.code', codes)
          .orderBy('v.position')
          .orderBy('v.code')
          .select('a.code as attribute_code', 'v.code', 'v.label', 'v.swatch_hex', 'v.is_active')
  const brandQuery = client
    .from('brands')
    .where('status', 'active')
    .orderBy('name')
    .orderBy('id')
    .select('id', 'name', 'requires_moderation')
  if (options.keepBrandId) brandQuery.orWhere('id', options.keepBrandId)
  const brandRows: { id: string; name: string; requires_moderation: boolean }[] = await brandQuery
  return {
    categories: leaves.map(({ row, path }) => ({
      id: row.id,
      names: path.map((node) => node.name),
      isActive: row.is_active && !row.has_child,
      rules: (rulesOf.get(row.id) ?? [])
        .sort((a, b) => a.attribute_position - b.attribute_position || a.code.localeCompare(b.code))
        .map((rule) => ({ code: rule.code, usage: rule.usage, isRequired: rule.is_required })),
    })),
    attributes: attributeRows.map((attribute) => ({
      code: attribute.code,
      name: attribute.name,
      input: attribute.input,
      values: valueRows
        .filter((value) => value.attribute_code === attribute.code)
        .map((value) => ({
          code: value.code,
          label: value.label,
          swatchHex: value.swatch_hex,
          isActive: value.is_active,
        })),
    })),
    brands: brandRows.map((brand) => ({
      id: brand.id,
      name: brand.name,
      requiresModeration: brand.requires_moderation,
    })),
  }
}

export type CategoryTreeNode = {
  id: string
  slug: string
  name: string
  children: CategoryTreeNode[]
}

/*
 * The storefront's category tree (docs/06 §13.2 `listCategories`; R1-S part
 * 3a): every active category whose ancestors are all active, within its
 * parent by `position`, then name. A category under an inactive parent is
 * left out with its subtree, as the listing never shows it.
 */
export async function activeCategoryTree(): Promise<CategoryTreeNode[]> {
  const rows: { id: string; slug: string; name: string; parent_id: string | null }[] = await db
    .from('categories')
    .where('is_active', true)
    .select('id', 'slug', 'name', 'parent_id')
    .orderBy([{ column: 'depth' }, { column: 'position' }, { column: 'name' }])
  const nodes = new Map<string, CategoryTreeNode>()
  const roots: CategoryTreeNode[] = []
  // Parents come first (by depth), so a missing parent is an inactive one.
  for (const row of rows) {
    const node = { id: row.id, slug: row.slug, name: row.name, children: [] }
    const siblings = row.parent_id === null ? roots : nodes.get(row.parent_id)?.children
    if (!siblings) continue
    siblings.push(node)
    nodes.set(row.id, node)
  }
  return roots
}

/*
 * The path of an active category whose ancestors are all active, by slug, or
 * null: the subtree the storefront lists under it (docs/04a §7.1).
 */
export async function listedCategoryPath(slug: string): Promise<string | null> {
  const row = await db
    .from('categories as c')
    .where('c.slug', slug)
    .where('c.is_active', true)
    .whereNotExists((inactive) => {
      inactive
        .from('categories as a')
        .where('a.is_active', false)
        .whereRaw('c.path LIKE a.path || ?', ['%'])
    })
    .select('c.path')
    .first()
  return row ? (row.path as string) : null
}

export type FilterAttribute = {
  code: string
  name: string
  input: AttributeInput
  values: { code: string; label: string; swatchHex: string | null }[]
}

/*
 * The storefront's filters (docs/06 §13.2 `listAttributes`; R1-S part 3a):
 * the filterable attributes (`attributes.is_filterable`) with their active
 * values, by `position`, then code, or label and code. With a category
 * path, only the attributes a rule on that category, an ancestor or a
 * descendant names: the filters a product listed under it can match, since
 * the listing shows the whole subtree (docs/06 §6.3), so `clothing` offers
 * the sizes its leaves vary by. A rule counts only on a listed category
 * (active, every ancestor active), so a hidden subtree adds no filter: the
 * NOT EXISTS below also matches the rule's category itself when inactive.
 * Without one, every filterable attribute.
 */
export async function filterableAttributes(
  categoryPath: string | null
): Promise<FilterAttribute[]> {
  const query = db
    .from('attributes as a')
    .where('a.is_filterable', true)
    .select('a.id', 'a.code', 'a.name', 'a.input')
    .orderBy([{ column: 'a.position' }, { column: 'a.code' }])
  if (categoryPath !== null) {
    query.whereExists((rule) => {
      rule
        .from('category_attributes as ca')
        .join('categories as c', 'c.id', 'ca.category_id')
        .whereColumn('ca.attribute_id', 'a.id')
        .whereNotExists((inactive) => {
          inactive
            .from('categories as x')
            .where('x.is_active', false)
            .whereRaw('c.path LIKE x.path || ?', ['%'])
        })
        .where((related) => {
          related
            .whereRaw('? LIKE c.path || ?', [categoryPath, '%'])
            .orWhereRaw('c.path LIKE ? || ?', [categoryPath, '%'])
        })
    })
  }
  const attributes: { id: string; code: string; name: string; input: AttributeInput }[] =
    await query
  if (attributes.length === 0) return []
  const values: { attribute_id: string; code: string; label: string; swatch_hex: string | null }[] =
    await db
      .from('attribute_values')
      .whereIn(
        'attribute_id',
        attributes.map((attribute) => attribute.id)
      )
      .where('is_active', true)
      .select('attribute_id', 'code', 'label', 'swatch_hex')
      .orderBy([{ column: 'position' }, { column: 'label' }, { column: 'code' }])
  return attributes.map((attribute) => ({
    code: attribute.code,
    name: attribute.name,
    input: attribute.input,
    values: values
      .filter((value) => value.attribute_id === attribute.id)
      .map((value) => ({ code: value.code, label: value.label, swatchHex: value.swatch_hex })),
  }))
}

/*
 * The filterable attributes the listing can match, by code, with the
 * `product_listings` array each is matched in and its active value codes
 * (docs/04a §7.12; R1-S part 3b): `audience` in `audience_value_ids`,
 * `color` in `color_value_ids`, and every other variant-scope attribute, a
 * size system, in `size_value_ids`, as `catalog.refresh_listing` fills them.
 * A filterable product-scope attribute other than `audience` has no column
 * and is not offered here.
 */
export async function listingFilterAttributes(): Promise<Map<string, FilterableAttribute>> {
  const rows: {
    code: string
    scope: string
    value_code: string | null
    value_id: string | null
  }[] = await db
    .from('attributes as a')
    .leftJoin('attribute_values as v', (join) => {
      join.on('v.attribute_id', 'a.id').andOnVal('v.is_active', true)
    })
    .where('a.is_filterable', true)
    .select('a.code', 'a.scope', 'v.code as value_code', 'v.id as value_id')
  const attributes = new Map<string, { column: ListingColumn; values: Map<string, string> }>()
  for (const row of rows) {
    const column: ListingColumn | null =
      row.code === 'audience'
        ? 'audience_value_ids'
        : row.scope !== 'variant'
          ? null
          : row.code === 'color'
            ? 'color_value_ids'
            : 'size_value_ids'
    if (column === null) continue
    const attribute = attributes.get(row.code) ?? { column, values: new Map<string, string>() }
    if (row.value_code !== null && row.value_id !== null) {
      attribute.values.set(row.value_code, row.value_id)
    }
    attributes.set(row.code, attribute)
  }
  return attributes
}

export type ListingCardRow = {
  product_id: string
  public_id: string
  slug: string
  title: string
  shop_slug: string
  shop_name: string
  brand_slug: string | null
  brand_name: string | null
  min_price_minor: number
  max_price_minor: number
  compare_at_price_minor: number | null
  currency: string
  in_stock: boolean
  primary_image_keys: Record<string, string>
  primary_image_alt: string
  published_at: Date
}

const LISTING_COLUMNS = new Set<ListingColumn>([
  'audience_value_ids',
  'size_value_ids',
  'color_value_ids',
])

// The capped count reads at most this many rows (docs/06 §6.1).
const COUNT_LIMIT = 10_001

/*
 * The trigram word similarity at which the typo fallback matches a title
 * [Assumption]: pg_trgm's default of 0.6 misses a one-letter typo in a
 * seven-letter word ("snekers" against "sneakers" is 0.55).
 */
const TYPO_WORD_SIMILARITY = 0.5

/*
 * One page of the storefront listing (docs/06 §6.1, §6.3 `listProducts`;
 * ADR-0014 decisions 3 and 4; R1-S part 3b), read from `product_listings`
 * alone, and the capped count of every matching row. A category that is not
 * listed (unknown, inactive, or under an inactive parent) matches nothing.
 *
 * - The category subtree is a prefix match on `category_path`
 *   (`product_listings_category_idx`), and the shop its `shop_id`
 *   (`product_listings_shop_idx`), read from its slug first; the other
 *   filters apply to the rows those select. A value filter matches a row
 *   whose array holds any of the IDs (`&&`); filters all apply. A price
 *   filter matches a row whose price range overlaps the range asked for.
 * - It opens its own read transaction for the typo fallback, so it is never
 *   called inside another transaction.
 * - `q` matches `search_tsv` with `websearch_to_tsquery('simple', q)`. When
 *   that finds nothing under the other filters, `q` is matched against the
 *   closest run of words in the title by trigram word similarity
 *   (`q <% title`, served by
 *   `product_listings_title_trgm_idx`), at `TYPO_WORD_SIMILARITY` set for
 *   that read transaction alone, so a typo such as "snekers" still finds
 *   "sneakers" (AC-FR-SRCH-002-2); whole-title `similarity` stays far below
 *   any threshold for a one-word query in a longer title.
 * - Order: the sort key, then `product_id` (AC-FR-SRCH-001-2). Relevance is
 *   `ts_rank`, or the word similarity in the fallback. One extra row is read
 *   for `has_more`; `page × per_page` is at most 4,800, which bounds OFFSET.
 */
export async function listingPage(
  filters: ListingFilters
): Promise<{ rows: ListingCardRow[]; counted: number }> {
  let categoryPath: string | null = null
  if (filters.categorySlug !== null) {
    categoryPath = await listedCategoryPath(filters.categorySlug)
    if (categoryPath === null) return { rows: [], counted: 0 }
  }
  let shopId: string | null = null
  if (filters.shopSlug !== null) {
    shopId = await shopIdBySlug(filters.shopSlug)
    if (shopId === null) return { rows: [], counted: 0 }
  }
  // Used only when a search was sent.
  const q = filters.q ?? ''
  const read = async (client: QueryClientContract, match: 'text' | 'trigram' | null) => {
    const matching = () => {
      const query = client.from('product_listings')
      if (categoryPath !== null) query.whereRaw('category_path LIKE ?', [`${categoryPath}%`])
      for (const filter of filters.valueFilters) {
        if (!LISTING_COLUMNS.has(filter.column)) throw new Error(`unknown column ${filter.column}`)
        // The IDs come from `attribute_values`, so the array literal holds UUIDs only.
        query.whereRaw('?? && ?::uuid[]', [filter.column, `{${filter.ids.join(',')}}`])
      }
      if (filters.brandSlugs.length > 0) query.whereIn('brand_slug', filters.brandSlugs)
      if (shopId !== null) query.where('shop_id', shopId)
      if (filters.priceMinMinor !== null) {
        query.where('max_price_minor', '>=', filters.priceMinMinor)
      }
      if (filters.priceMaxMinor !== null) {
        query.where('min_price_minor', '<=', filters.priceMaxMinor)
      }
      if (filters.inStock) query.where('in_stock', true)
      if (match === 'text') {
        query.whereRaw(`search_tsv @@ websearch_to_tsquery('simple', ?)`, [q])
      }
      if (match === 'trigram') query.whereRaw('? <% title', [q])
      return query
    }
    const capped = matching().select(client.raw('1')).limit(COUNT_LIMIT).as('capped')
    const [countRow] = await client.from(capped).count('* as n')
    const counted = Number(countRow.n)
    if (counted === 0) return { rows: [], counted }
    const page = matching().select(
      'product_id',
      'public_id',
      'slug',
      'title',
      'shop_slug',
      'shop_name',
      'brand_slug',
      'brand_name',
      'min_price_minor',
      'max_price_minor',
      'compare_at_price_minor',
      'currency',
      'in_stock',
      'primary_image_keys',
      'primary_image_alt',
      'published_at'
    )
    if (filters.sort === 'relevance') {
      if (match === 'text') {
        page.orderByRaw(`ts_rank(search_tsv, websearch_to_tsquery('simple', ?)) DESC`, [q])
      } else {
        page.orderByRaw('word_similarity(?, title) DESC', [q])
      }
    } else if (filters.sort === 'newest') {
      page.orderBy('published_at', 'desc')
    } else {
      page.orderBy('min_price_minor', filters.sort === 'price_asc' ? 'asc' : 'desc')
    }
    const rows: ListingCardRow[] = await page
      .orderBy('product_id', 'asc')
      .limit(filters.perPage + 1)
      .offset((filters.page - 1) * filters.perPage)
    return { rows, counted }
  }

  const first = await read(db.connection(), filters.q === null ? null : 'text')
  if (filters.q === null || first.counted > 0) return first
  // The typo fallback, with its own threshold for this transaction only.
  return withTx(async (trx) => {
    await trx.rawQuery(`SELECT set_config('pg_trgm.word_similarity_threshold', ?, true)`, [
      String(TYPO_WORD_SIMILARITY),
    ])
    return read(trx, 'trigram')
  })
}

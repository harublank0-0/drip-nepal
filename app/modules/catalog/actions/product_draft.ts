import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError } from '#exceptions/domain_error'
import {
  checkProductAttributes,
  type AttributeRequest,
  type ResolvedValue,
  type RuleProblem,
} from '#modules/catalog/domain/attribute_rules'
import { newPublicId, productSlug } from '#modules/catalog/domain/identifiers'
import { originProblems } from '#modules/catalog/domain/disclosures'
import type { EffectiveRule } from '#modules/catalog/domain/attribute_rules'
import {
  activeLeafCategory,
  attributeValuesOf,
  categoryRef,
  effectiveRules,
  selectableBrand,
} from '#modules/catalog/queries'
import { withSavepoint } from '#modules/platform/tx'

/*
 * The catalog steps of a product draft (docs/09 §12.8; docs/04 §3.4, §3.6,
 * §3.7; docs/04a §7.6, §7.7, §7.9; R1-S part 2a). The entry actions
 * (`inventory.createProduct`, `catalog.updateProduct`) run them inside
 * their transaction.
 */
export type ProductFields = {
  title: string
  description: string | null
  categoryId: string
  brandId: string | null
  attributes: AttributeRequest[]
  manufacturerName: string | null
  isImported: boolean
  countryOfOrigin: string | null
  warrantyText: string | null
  careAndPrecautions: string | null
}

export function validationFailed(problems: RuleProblem[]) {
  return new DomainError('VALIDATION_FAILED', { errors: problems })
}

/*
 * What an action checks of a product's fields against other rows. A create
 * checks everything; an edit checks only what it sends or changes, so a
 * platform change to a rule or a brand does not lock a vendor out of
 * unrelated edits (a product that no longer complies stays as it is and is
 * flagged, docs/04 §3.7 "Revisit when").
 */
export type FieldChecks = {
  // `active_leaf` for a create or a new category (T-CAT-101); `stored` reads the kept category.
  category: 'active_leaf' | 'stored'
  brand: boolean
  attributes: boolean
  origin: boolean
  // The required attributes of a live product (04 §3.7 rule 4).
  complete: boolean
  // Value IDs already on the product, which may stay although inactive.
  keptValueIds?: ReadonlySet<string>
}

export const CHECK_EVERYTHING: FieldChecks = {
  category: 'active_leaf',
  brand: true,
  attributes: true,
  origin: true,
  complete: false,
}

/*
 * The rules that need other rows, checked together so one 422 lists every
 * problem (06 §5.1): an active leaf category (T-CAT-101), a selectable
 * brand, the origin rule of `products_country_check`, and the attribute
 * rules of 04 §3.7 (T-CAT-104). Returns the category, its effective rules,
 * the resolved values (null when the attributes were not checked) and the
 * chosen brand.
 */
export async function checkProductFields(
  trx: TransactionClientContract,
  fields: Pick<
    ProductFields,
    'categoryId' | 'brandId' | 'attributes' | 'isImported' | 'countryOfOrigin'
  >,
  checks: FieldChecks
) {
  const problems: RuleProblem[] = []
  const category =
    checks.category === 'active_leaf'
      ? await activeLeafCategory(trx, fields.categoryId)
      : await categoryRef(trx, fields.categoryId)
  if (!category) {
    problems.push({
      field: 'category_id',
      code: 'invalid',
      message: 'Choose a category from the list.',
    })
  }
  const brand = checks.brand && fields.brandId ? await selectableBrand(trx, fields.brandId) : null
  if (checks.brand && fields.brandId && !brand) {
    problems.push({ field: 'brand_id', code: 'invalid', message: 'Choose a brand from the list.' })
  }
  if (checks.origin) problems.push(...originProblems(fields))
  let values: ResolvedValue[] | null = null
  let rules = new Map<string, EffectiveRule>()
  if (category) {
    rules = await effectiveRules(trx, category.path)
    if (checks.attributes) {
      const checked = checkProductAttributes({
        rules,
        values: await attributeValuesOf(
          trx,
          fields.attributes.map((attribute) => attribute.code)
        ),
        requested: fields.attributes,
        kept: checks.keptValueIds,
        complete: checks.complete,
      })
      problems.push(...checked.problems)
      values = checked.resolved
    }
  }
  return { category, rules, values, brand, problems }
}

// Replaces a product's attribute values as a set (docs/04a §7.7, docs/04 §2.15).
export async function writeAttributeValues(
  trx: TransactionClientContract,
  product: { id: string; shopId: string },
  values: readonly ResolvedValue[]
) {
  await trx.from('product_attribute_values').where('product_id', product.id).delete()
  if (values.length === 0) return
  await trx.table('product_attribute_values').multiInsert(
    values.map((value) => ({
      product_id: product.id,
      shop_id: product.shopId,
      attribute_id: value.attributeId,
      attribute_value_id: value.valueId,
    }))
  )
}

/*
 * Inserts the `draft` product, its attribute values and its default variant
 * (docs/04 §3.4; 04a §7.9: `is_default`, `option_signature` `''`, price 0,
 * SKU `DN-<public_id>`). `public_id` is random: a collision is retried in a
 * savepoint, so the outer transaction survives (T-CAT-007). The caller
 * opens the variant's `inventory_items` row (it belongs to `inventory`).
 */
export async function insertProductDraft(
  trx: TransactionClientContract,
  fields: ProductFields,
  owner: { shopId: string; actorUserId: string },
  newId: () => string = newPublicId
) {
  const { category, values, problems } = await checkProductFields(trx, fields, CHECK_EVERYTHING)
  if (problems.length > 0 || !category) throw validationFailed(problems)
  const product = await withFreshPublicId(trx, newId, async (publicId, savepoint) => {
    const [row] = await savepoint
      .table('products')
      .insert({
        shop_id: owner.shopId,
        public_id: publicId,
        slug: productSlug(fields.title),
        title: fields.title,
        description: fields.description,
        category_id: category.id,
        brand_id: fields.brandId,
        manufacturer_name: fields.manufacturerName,
        is_imported: fields.isImported,
        country_of_origin: fields.countryOfOrigin,
        warranty_text: fields.warrantyText,
        care_and_precautions: fields.careAndPrecautions,
        status: 'draft',
        version: 1,
        created_by: owner.actorUserId,
      })
      .returning(['id', 'public_id'])
    return { id: row.id as string, publicId: row.public_id as string }
  })
  await writeAttributeValues(trx, { id: product.id, shopId: owner.shopId }, values ?? [])
  const [variant] = await trx
    .table('product_variants')
    .insert({
      shop_id: owner.shopId,
      product_id: product.id,
      sku: `DN-${product.publicId}`,
      price_minor: 0,
      currency: 'NPR',
      is_default: true,
      option_signature: '',
      status: 'active',
      version: 1,
    })
    .returning('id')
  return { productId: product.id, category, defaultVariantId: variant.id as string }
}

async function withFreshPublicId<T>(
  trx: TransactionClientContract,
  newId: () => string,
  insert: (publicId: string, savepoint: TransactionClientContract) => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withSavepoint(trx, (savepoint) => insert(newId(), savepoint))
    } catch (error) {
      const pg = error as { code?: string; constraint?: string }
      const collided = pg.code === '23505' && pg.constraint === 'products_public_id_key'
      if (!collided || attempt >= 3) throw error
    }
  }
}

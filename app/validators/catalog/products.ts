import vine from '@vinejs/vine'
import { PRODUCT_LIMITS } from '#shared/constants/limits'
import { clearableNfcText, nfcText } from '#validators/support/nfc_text'

/*
 * The product draft inputs (docs/06 §13.5 `createProduct`, `updateProduct`;
 * `CreateProductRequest` in openapi.yaml; docs/09 §12.5; R1-S part 2a). The
 * members are the whole input: `shop_id`, `status`, `version`, `public_id`
 * and `created_by` are refused with `unknown_field` before this runs
 * (`assertKnownMembers`, T-SEC-003), and so is any unknown member of an
 * `attributes` item (`assertKnownItemMembers`). Rules:
 *
 * - `title`: trimmed, NFC, 3 to 120 code points (`products_title_check`).
 * - `description` and the four s6 disclosures: trimmed NFC text up to the
 *   04a §7.6 maximum, or null; a value of spaces clears it, as `""` does
 *   (the JSON body parser reads `""` as null). Null is allowed on a draft;
 *   submit requires them (`missingForSubmit`).
 * - `category_id`, `brand_id`: UUIDs. Which category and brand may be used
 *   is the action's check (an active leaf, an active brand).
 * - `attributes`: at most 30 items, distinct codes, each with 1 to 20
 *   distinct value codes in the reference-data shapes
 *   (`attributes_code_check`, `attribute_values_code_check`).
 * - `is_imported`: a strict boolean; `country_of_origin`: ISO 3166-1
 *   alpha-2 upper case, or null. Whether it agrees with `is_imported` is
 *   the action's check (`products_country_check`).
 *
 * `createProduct` takes every member, `brand_id` alone being optional (06
 * §13.5). `updateProduct` takes any of them; the members of
 * `UPDATE_NOT_NULL_MEMBERS` may be left out but never sent as null
 * (`assertNotNull`, 422 `required`).
 */
export const PRODUCT_MEMBERS = [
  'title',
  'description',
  'category_id',
  'brand_id',
  'attributes',
  'manufacturer_name',
  'is_imported',
  'country_of_origin',
  'warranty_text',
  'care_and_precautions',
] as const

export const ATTRIBUTE_ITEM_MEMBERS = ['attribute_code', 'value_codes'] as const

export const UPDATE_NOT_NULL_MEMBERS = [
  'title',
  'category_id',
  'attributes',
  'is_imported',
] as const

const attributes = () =>
  vine
    .array(
      vine.object({
        attribute_code: vine.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
        value_codes: vine
          .array(vine.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/))
          .minLength(1)
          .maxLength(PRODUCT_LIMITS.attributeValues.max)
          .distinct(),
      })
    )
    .maxLength(PRODUCT_LIMITS.attributes.max)
    .distinct('attribute_code')

const disclosure = (max: number) => clearableNfcText({ min: 1, max }).nullable()
const country = () =>
  vine
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()

export const createProductValidator = vine.create({
  title: nfcText(PRODUCT_LIMITS.title),
  description: disclosure(PRODUCT_LIMITS.description.max),
  category_id: vine.string().uuid(),
  brand_id: vine.string().uuid().nullable().optional(),
  attributes: attributes(),
  manufacturer_name: disclosure(PRODUCT_LIMITS.manufacturerName.max),
  is_imported: vine.boolean({ strict: true }),
  country_of_origin: country(),
  warranty_text: disclosure(PRODUCT_LIMITS.warrantyText.max),
  care_and_precautions: disclosure(PRODUCT_LIMITS.careAndPrecautions.max),
})

export const updateProductValidator = vine.create({
  title: nfcText(PRODUCT_LIMITS.title).optional(),
  description: disclosure(PRODUCT_LIMITS.description.max).optional(),
  category_id: vine.string().uuid().optional(),
  brand_id: vine.string().uuid().nullable().optional(),
  attributes: attributes().optional(),
  manufacturer_name: disclosure(PRODUCT_LIMITS.manufacturerName.max).optional(),
  is_imported: vine.boolean({ strict: true }).optional(),
  country_of_origin: country().optional(),
  warranty_text: disclosure(PRODUCT_LIMITS.warrantyText.max).optional(),
  care_and_precautions: disclosure(PRODUCT_LIMITS.careAndPrecautions.max).optional(),
})

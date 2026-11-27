import { test } from '@japa/runner'
import { COUNTRY_CODES } from '#shared/constants/countries'
import {
  attributesBody,
  changedFields,
  changedMembers,
  createBody,
  detailsFieldOf,
  detailsFrom,
  emptyDetails,
  offeredValues,
  productAttributesFor,
  productEditable,
  unusedAttributeCodes,
  type AttributeOption,
  type CategoryOption,
  type SellerProduct,
} from '#shared/ui/product_details'
import { PRODUCT_STATUSES } from '#modules/catalog/domain/product_status'
import { catalogEditable, catalogViewable } from '#shared/ui/shop_access'

/*
 * T-UI-042, the rules part of the product details form (docs/08 §2.5;
 * R1-S part 2f-i; shared/ui/product_details.ts): which statuses may be
 * edited and which shop statuses open the catalogue, the bodies of
 * `createProduct` and `updateProduct` (trimmed text, null for an empty
 * one, the origin pair, only the chosen category's attributes, only the
 * changed members), what a 412 changed, where a server error lands, and the
 * country list. A small dataset stands in for the seeded reference data.
 */
const CATEGORY: CategoryOption = {
  id: 'cat-tees',
  label: 'Clothing › Tops › T-Shirts',
  is_active: true,
  rules: [
    { attribute_code: 'audience', usage: 'product', is_required: true },
    { attribute_code: 'material', usage: 'product', is_required: true },
    { attribute_code: 'fit', usage: 'product', is_required: false },
    { attribute_code: 'apparel_size', usage: 'variant_axis', is_required: true },
  ],
}

const SHOES: CategoryOption = {
  id: 'cat-sneakers',
  label: 'Footwear › Sneakers',
  is_active: true,
  rules: [
    { attribute_code: 'audience', usage: 'product', is_required: true },
    { attribute_code: 'material', usage: 'product', is_required: true },
  ],
}

const value = (code: string, label: string, isActive = true) => ({
  id: `v-${code}`,
  code,
  label,
  swatch_hex: null,
  is_active: isActive,
})

const ATTRIBUTES: AttributeOption[] = [
  {
    code: 'audience',
    name: 'Audience',
    input: 'multi',
    values: [value('men', 'Men'), value('women', 'Women'), value('kids', 'Kids')],
  },
  {
    code: 'material',
    name: 'Material',
    input: 'multi',
    values: [value('cotton', 'Cotton'), value('hemp', 'Hemp', false), value('linen', 'Linen')],
  },
  {
    code: 'fit',
    name: 'Fit',
    input: 'single',
    values: [value('regular', 'Regular'), value('oversized', 'Oversized')],
  },
  {
    code: 'apparel_size',
    name: 'Size',
    input: 'single',
    values: [value('s', 'S'), value('m', 'M')],
  },
]

function product(overrides: Partial<SellerProduct> = {}): SellerProduct {
  return {
    id: 'p1',
    public_id: 'ABCDEFGH',
    status: 'draft',
    version: 3,
    title: 'Crew tee',
    description: null,
    category: { id: 'cat-tees', path: '/clothing/tops/t-shirts/' },
    brand: null,
    attributes: [
      { attribute_code: 'audience', value_codes: ['men'] },
      { attribute_code: 'material', value_codes: ['cotton'] },
    ],
    manufacturer_name: 'Kathmandu Threads',
    is_imported: false,
    country_of_origin: null,
    warranty_text: null,
    care_and_precautions: null,
    rejection_reason: null,
    option_axes: [],
    variants: [],
    media: [],
    missing_for_submit: [],
    updated_at: '2026-11-26T00:00:00.000Z',
    ...overrides,
  }
}

test.group('T-UI-042 product details rules', () => {
  test('T-UI-042 a product may be edited unless it is under review, archived or blocked', ({
    assert,
  }) => {
    const editable = PRODUCT_STATUSES.filter((status) => productEditable(status))
    assert.sameMembers(editable, ['draft', 'rejected', 'published', 'unpublished'])
  })

  test('T-UI-042 the catalogue opens while active or suspended, and changes while active only', ({
    assert,
  }) => {
    const statuses = ['pending_review', 'active', 'rejected', 'suspended', 'closed']
    assert.deepEqual(
      statuses.filter((status) => catalogViewable(status)),
      ['active', 'suspended']
    )
    assert.deepEqual(
      statuses.filter((status) => catalogEditable(status)),
      ['active']
    )
  })

  test('T-UI-042 the form shows the category’s product attributes, not its axes', ({ assert }) => {
    const shown = productAttributesFor(CATEGORY, ATTRIBUTES).map(({ attribute, required }) => [
      attribute.code,
      required,
    ])
    assert.deepEqual(shown, [
      ['audience', true],
      ['material', true],
      ['fit', false],
    ])
    assert.deepEqual(productAttributesFor(undefined, ATTRIBUTES), [])
  })

  test('T-UI-042 a retired value is offered only to a product that has it', ({ assert }) => {
    const material = ATTRIBUTES[1]
    assert.deepEqual(
      offeredValues(material, []).map((item) => item.code),
      ['cotton', 'linen']
    )
    assert.deepEqual(
      offeredValues(material, ['hemp']).map((item) => item.code),
      ['cotton', 'hemp', 'linen']
    )
  })

  test('T-UI-042 a new draft is sent trimmed, with empty text as null and a domestic product from Nepal', ({
    assert,
  }) => {
    const values = {
      ...emptyDetails(),
      title: '  Crew tee  ',
      description: '   ',
      category_id: 'cat-tees',
      attributes: { audience: ['women', 'men'], apparel_size: ['m'], sleeve_length: ['short'] },
      manufacturer_name: ' Kathmandu Threads ',
      warranty_text: 'No warranty',
    }
    assert.deepEqual(createBody(values, CATEGORY, ATTRIBUTES), {
      title: 'Crew tee',
      description: null,
      category_id: 'cat-tees',
      brand_id: null,
      // In the attribute's order; a variant axis and an attribute the category lacks are left out.
      attributes: [{ attribute_code: 'audience', value_codes: ['men', 'women'] }],
      manufacturer_name: 'Kathmandu Threads',
      is_imported: false,
      country_of_origin: 'NP',
      warranty_text: 'No warranty',
      care_and_precautions: null,
    })
  })

  test('T-UI-042 an imported product sends its country, or none yet, never Nepal', ({ assert }) => {
    const base = { ...emptyDetails(), title: 'Tee', category_id: 'cat-tees' }
    const chosen = createBody(
      { ...base, origin: 'imported', country_of_origin: 'IN' },
      CATEGORY,
      ATTRIBUTES
    )
    assert.include(chosen, { is_imported: true, country_of_origin: 'IN' })
    const none = createBody({ ...base, origin: 'imported' }, CATEGORY, ATTRIBUTES)
    assert.include(none, { is_imported: true, country_of_origin: null })
    const nepal = createBody(
      { ...base, origin: 'imported', country_of_origin: 'NP' },
      CATEGORY,
      ATTRIBUTES
    )
    assert.include(nepal, { is_imported: true, country_of_origin: null })
  })

  test('T-UI-042 the form starts from the product as saved', ({ assert }) => {
    const values = detailsFrom(
      product({ is_imported: true, country_of_origin: 'CN', brand: { id: 'b1', name: 'Brand' } })
    )
    assert.deepEqual(values, {
      title: 'Crew tee',
      description: '',
      category_id: 'cat-tees',
      brand_id: 'b1',
      attributes: { audience: ['men'], material: ['cotton'] },
      manufacturer_name: 'Kathmandu Threads',
      origin: 'imported',
      country_of_origin: 'CN',
      warranty_text: '',
      care_and_precautions: '',
    })
  })

  test('T-UI-042 an unchanged form sends nothing, and a domestic product saved without a country stays so', ({
    assert,
  }) => {
    const saved = product()
    assert.deepEqual(changedMembers(detailsFrom(saved), saved, CATEGORY, ATTRIBUTES), {})
  })

  test('T-UI-042 only the changed members are sent', ({ assert }) => {
    const saved = product()
    const values = {
      ...detailsFrom(saved),
      title: 'Crew tee, heavy',
      warranty_text: 'No warranty',
      manufacturer_name: '',
      attributes: { audience: ['men'], material: ['cotton', 'linen'] },
    }
    assert.deepEqual(changedMembers(values, saved, CATEGORY, ATTRIBUTES), {
      title: 'Crew tee, heavy',
      attributes: [
        { attribute_code: 'audience', value_codes: ['men'] },
        { attribute_code: 'material', value_codes: ['cotton', 'linen'] },
      ],
      manufacturer_name: null,
      warranty_text: 'No warranty',
    })
  })

  test('T-UI-042 the same attribute values in another order are not a change', ({ assert }) => {
    const saved = product({
      attributes: [
        { attribute_code: 'material', value_codes: ['linen', 'cotton'] },
        { attribute_code: 'audience', value_codes: ['women', 'men'] },
      ],
    })
    assert.deepEqual(changedMembers(detailsFrom(saved), saved, CATEGORY, ATTRIBUTES), {})
  })

  test('T-UI-044 values of an attribute the category no longer uses leave with the next save; typed changes leave them out', ({
    assert,
  }) => {
    const saved = product({
      attributes: [
        { attribute_code: 'audience', value_codes: ['men'] },
        { attribute_code: 'sleeve_length', value_codes: ['short'] },
      ],
    })
    assert.deepEqual(unusedAttributeCodes(saved, CATEGORY), ['sleeve_length'])
    assert.deepEqual(unusedAttributeCodes(saved, undefined), [])
    assert.deepEqual(unusedAttributeCodes(product(), CATEGORY), [])
    const values = { ...detailsFrom(saved), warranty_text: 'No warranty' }
    // The save sends the attributes the category uses, which removes the rest.
    assert.deepEqual(changedMembers(values, saved, CATEGORY, ATTRIBUTES), {
      attributes: [{ attribute_code: 'audience', value_codes: ['men'] }],
      warranty_text: 'No warranty',
    })
    assert.deepEqual(changedMembers(detailsFrom(saved), saved, CATEGORY, ATTRIBUTES), {
      attributes: [{ attribute_code: 'audience', value_codes: ['men'] }],
    })
    // What the user typed: nothing until they change something.
    assert.deepEqual(
      changedMembers(detailsFrom(saved), saved, CATEGORY, ATTRIBUTES, { typedOnly: true }),
      {}
    )
    assert.deepEqual(changedMembers(values, saved, CATEGORY, ATTRIBUTES, { typedOnly: true }), {
      warranty_text: 'No warranty',
    })
    // A change to one of the category's attributes sends the list it uses.
    const changed = { ...detailsFrom(saved), attributes: { audience: ['men', 'women'] } }
    assert.deepEqual(changedMembers(changed, saved, CATEGORY, ATTRIBUTES), {
      attributes: [{ attribute_code: 'audience', value_codes: ['men', 'women'] }],
    })
  })

  test('T-UI-042 a new category sends the attributes it uses, even unchanged', ({ assert }) => {
    const saved = product({
      attributes: [
        { attribute_code: 'audience', value_codes: ['men'] },
        { attribute_code: 'fit', value_codes: ['regular'] },
      ],
    })
    const values = { ...detailsFrom(saved), category_id: 'cat-sneakers' }
    assert.deepEqual(changedMembers(values, saved, SHOES, ATTRIBUTES), {
      category_id: 'cat-sneakers',
      attributes: [{ attribute_code: 'audience', value_codes: ['men'] }],
    })
  })

  test('T-UI-042 the origin pair is sent when the origin or an imported product’s country changes', ({
    assert,
  }) => {
    const domestic = product()
    assert.deepEqual(
      changedMembers(
        { ...detailsFrom(domestic), origin: 'imported', country_of_origin: 'IN' },
        domestic,
        CATEGORY,
        ATTRIBUTES
      ),
      { is_imported: true, country_of_origin: 'IN' }
    )
    const imported = product({ is_imported: true, country_of_origin: 'IN' })
    assert.deepEqual(
      changedMembers(
        { ...detailsFrom(imported), country_of_origin: 'CN' },
        imported,
        CATEGORY,
        ATTRIBUTES
      ),
      { is_imported: true, country_of_origin: 'CN' }
    )
    assert.deepEqual(
      changedMembers(
        { ...detailsFrom(imported), origin: 'domestic' },
        imported,
        CATEGORY,
        ATTRIBUTES
      ),
      { is_imported: false, country_of_origin: 'NP' }
    )
  })

  test('T-UI-042 brand: the own label is null, a brand its ID', ({ assert }) => {
    const saved = product({ brand: { id: 'b1', name: 'Brand' } })
    assert.deepEqual(
      changedMembers({ ...detailsFrom(saved), brand_id: '' }, saved, CATEGORY, ATTRIBUTES),
      { brand_id: null }
    )
    assert.deepEqual(
      changedMembers(
        { ...detailsFrom(product()), brand_id: 'b2' },
        product(),
        CATEGORY,
        ATTRIBUTES
      ),
      { brand_id: 'b2' }
    )
  })

  test('T-UI-042 a 412 lists the fields saved differently, in the form’s order', ({ assert }) => {
    const before = product()
    const after = product({
      version: 4,
      care_and_precautions: 'Wash cold',
      title: 'Crew tee v2',
      attributes: [
        { attribute_code: 'material', value_codes: ['cotton'] },
        { attribute_code: 'audience', value_codes: ['men', 'women'] },
      ],
    })
    assert.deepEqual(changedFields(before, after), ['title', 'attributes', 'care_and_precautions'])
    assert.deepEqual(changedFields(before, product({ version: 9 })), [])
  })

  test('T-UI-042 a server error lands on its field, an attribute item by the index sent', ({
    assert,
  }) => {
    const sent = ['audience', 'material']
    assert.equal(detailsFieldOf('title', sent), 'title')
    assert.equal(detailsFieldOf('category_id', sent), 'category_id')
    assert.equal(detailsFieldOf('is_imported', sent), 'origin')
    assert.equal(detailsFieldOf('country_of_origin', sent), 'country_of_origin')
    assert.equal(detailsFieldOf('attributes.1.value_codes', sent), 'attributes.material')
    assert.equal(detailsFieldOf('attributes.0.attribute_code', sent), 'attributes.audience')
    assert.equal(detailsFieldOf('attributes.0.value_codes.2', sent), 'attributes.audience')
    // A missing required attribute, an index not sent and a member the form lacks: the summary.
    assert.isNull(detailsFieldOf('attributes', sent))
    assert.isNull(detailsFieldOf('attributes.5.value_codes', sent))
    assert.isNull(detailsFieldOf('shop_id', sent))
    assert.isNull(detailsFieldOf(null, sent))
  })

  test('T-UI-042 attributes of a category with none are sent as an empty list', ({ assert }) => {
    const empty: CategoryOption = { ...CATEGORY, rules: [] }
    const values = { ...emptyDetails(), attributes: { audience: ['men'] } }
    assert.deepEqual(attributesBody(values, empty, ATTRIBUTES), [])
  })

  test('T-UI-042 the country list is the 249 assigned ISO 3166-1 alpha-2 codes', ({ assert }) => {
    assert.lengthOf(COUNTRY_CODES, 249)
    assert.lengthOf(new Set(COUNTRY_CODES), 249)
    assert.isTrue(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code)))
    assert.deepEqual([...COUNTRY_CODES], [...COUNTRY_CODES].sort())
    assert.includeMembers([...COUNTRY_CODES], ['NP', 'IN', 'CN', 'US', 'GB'])
  })
})

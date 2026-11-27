import { test } from '@japa/runner'
import { optionSignature } from '#modules/catalog/domain/option_signature'
import { VARIANT_LIMITS } from '#shared/constants/limits'
import type { AttributeOption, CategoryOption, SellerProduct } from '#shared/ui/product_details'
import {
  axesLocked,
  axisOptionsFor,
  buildRows,
  combinations,
  compareAtProblem,
  offeredAxisValues,
  optionKey,
  orderedAxes,
  priceProblem,
  sameAsSaved,
  savedSelection,
  setProblem,
  skuProblem,
  variantConflictFields,
  variantFieldOf,
  variantsBody,
  variantValuesFrom,
  weightProblem,
  type VariantRow,
} from '#shared/ui/product_variants'

/*
 * T-UI-043, the rules part of the variant editor (docs/08 §2.5; 02 J-10
 * step 4; R1-S part 2f-ii; shared/ui/product_variants.ts): the options a
 * product may vary by, the grid of combinations, how a row keeps what was
 * typed and the existing variant of its combination (an active one before
 * an archived one), the checks of each row, the body sent, a set that
 * changes nothing, and where a server error lands. A small dataset stands
 * in for the seeded reference data.
 */
const value = (code: string, label: string, isActive = true) => ({
  code,
  label,
  swatch_hex: null,
  is_active: isActive,
})

const ATTRIBUTES: AttributeOption[] = [
  {
    code: 'apparel_size',
    name: 'Size',
    input: 'single',
    values: [value('s', 'S'), value('m', 'M'), value('l', 'L'), value('xxl', 'XXL', false)],
  },
  {
    code: 'color',
    name: 'Colour',
    input: 'single',
    values: [value('black', 'Black'), value('white', 'White')],
  },
  { code: 'fit', name: 'Fit', input: 'single', values: [value('regular', 'Regular')] },
]

const TEES: CategoryOption = {
  id: 'cat-tees',
  label: 'Clothing › Tops › T-Shirts',
  is_active: true,
  rules: [
    { attribute_code: 'fit', usage: 'product', is_required: false },
    { attribute_code: 'apparel_size', usage: 'variant_axis', is_required: true },
    { attribute_code: 'color', usage: 'variant_axis', is_required: false },
  ],
}

type Variant = SellerProduct['variants'][number]

function variant(overrides: Partial<Variant>): Variant {
  return {
    id: 'v-default',
    sku: 'DN-ABCDEFGH',
    label: 'Default',
    status: 'active',
    price: { amount_minor: 0, currency: 'NPR' },
    compare_at_price: null,
    weight_grams: null,
    is_default: true,
    on_hand: 0,
    option_value_codes: {},
    has_history: false,
    ...overrides,
  }
}

const sized = (id: string, size: string, overrides: Partial<Variant> = {}) =>
  variant({
    id,
    sku: `TEE-${size.toUpperCase()}`,
    label: `Size: ${size.toUpperCase()}`,
    is_default: false,
    price: { amount_minor: 129_900, currency: 'NPR' },
    option_value_codes: { apparel_size: size },
    ...overrides,
  })

function product(overrides: Partial<SellerProduct> = {}): SellerProduct {
  return {
    id: 'p1',
    public_id: 'ABCDEFGH',
    status: 'draft',
    version: 4,
    title: 'Crew tee',
    description: null,
    category: { id: 'cat-tees', path: '/clothing/tops/t-shirts/' },
    brand: null,
    attributes: [],
    manufacturer_name: null,
    is_imported: false,
    country_of_origin: null,
    warranty_text: null,
    care_and_precautions: null,
    rejection_reason: null,
    option_axes: [],
    variants: [variant({})],
    media: [],
    missing_for_submit: [],
    updated_at: '2026-11-27T00:00:00.000Z',
    ...overrides,
  }
}

const SIZED = product({
  option_axes: ['apparel_size'],
  variants: [
    sized('v-s', 's'),
    sized('v-m', 'm', { on_hand: 4, has_history: true }),
    sized('v-l', 'l', { status: 'archived', has_history: true }),
  ],
})

test.group('T-UI-043 variant editor rules', () => {
  test('T-UI-043 a row key is the server’s option signature, whatever the axis order', ({
    assert,
  }) => {
    const samples: Record<string, string>[] = [
      {},
      { apparel_size: 'm' },
      { color: 'black', apparel_size: 'm' },
    ]
    for (const codes of samples) {
      assert.equal(optionKey(codes), optionSignature(codes))
    }
    assert.equal(
      optionKey({ color: 'black', apparel_size: 'm' }),
      optionKey({ apparel_size: 'm', color: 'black' })
    )
  })

  test('T-UI-043 the options are the category’s axes, then any axis the product keeps', ({
    assert,
  }) => {
    const plain = axisOptionsFor(TEES, ATTRIBUTES, product())
    assert.deepEqual(
      plain.map((option) => [option.attribute.code, option.required]),
      [
        ['apparel_size', true],
        ['color', false],
      ]
    )
    const noRules: CategoryOption = { ...TEES, rules: [] }
    const kept = axisOptionsFor(noRules, ATTRIBUTES, SIZED)
    assert.deepEqual(
      kept.map((option) => [option.attribute.code, option.required]),
      [['apparel_size', false]]
    )
  })

  test('T-UI-043 a retired value is offered only while a variant of the product uses it', ({
    assert,
  }) => {
    const size = ATTRIBUTES[0]
    assert.deepEqual(
      offeredAxisValues(size, SIZED).map((item) => item.code),
      ['s', 'm', 'l']
    )
    const withRetired = product({
      option_axes: ['apparel_size'],
      variants: [sized('v-x', 'xxl')],
    })
    assert.include(
      offeredAxisValues(size, withRetired).map((item) => item.code),
      'xxl'
    )
  })

  test('T-UI-043 the axes keep the product’s order, new ones after', ({ assert }) => {
    const two = product({ option_axes: ['color', 'apparel_size'] })
    assert.deepEqual(orderedAxes(['apparel_size', 'color'], two), ['color', 'apparel_size'])
    assert.deepEqual(orderedAxes(['apparel_size', 'color'], SIZED), ['apparel_size', 'color'])
  })

  test('T-UI-043 combinations follow the axis order and each attribute’s picker order', ({
    assert,
  }) => {
    assert.deepEqual(combinations([], {}, ATTRIBUTES), [{}])
    assert.deepEqual(
      combinations(
        ['apparel_size', 'color'],
        { apparel_size: ['m', 's'], color: ['white', 'black'] },
        ATTRIBUTES
      ),
      [
        { apparel_size: 's', color: 'black' },
        { apparel_size: 's', color: 'white' },
        { apparel_size: 'm', color: 'black' },
        { apparel_size: 'm', color: 'white' },
      ]
    )
    assert.deepEqual(combinations(['apparel_size'], { apparel_size: [] }, ATTRIBUTES), [])
  })

  test('T-UI-043 the editor starts from the active variants’ options', ({ assert }) => {
    assert.deepEqual(savedSelection(SIZED), {
      axes: ['apparel_size'],
      values: { apparel_size: ['s', 'm'] },
    })
    const start = variantValuesFrom(SIZED, ATTRIBUTES)
    assert.deepEqual(
      start.rows.map((row) => [row.id, row.sku, row.price, row.onHand, row.hasHistory]),
      [
        ['v-s', 'TEE-S', '1299', 0, false],
        ['v-m', 'TEE-M', '1299', 4, true],
      ]
    )
    const plain = variantValuesFrom(product(), ATTRIBUTES)
    assert.deepEqual(plain.axes, [])
    assert.lengthOf(plain.rows, 1)
    // A price of 0 shows as empty, for the seller to fill in.
    assert.equal(plain.rows[0].price, '')
    assert.equal(plain.rows[0].id, 'v-default')
  })

  test('T-UI-043 a row keeps what was typed, reuses its variant, and a new row gets a SKU and the price', ({
    assert,
  }) => {
    const start = variantValuesFrom(SIZED, ATTRIBUTES)
    const typed: VariantRow[] = start.rows.map((row) =>
      row.id === 'v-s' ? { ...row, price: '999' } : row
    )
    const rows = buildRows(
      SIZED,
      ['apparel_size'],
      { apparel_size: ['s', 'm', 'l'] },
      ATTRIBUTES,
      typed
    )
    assert.deepEqual(
      rows.map((row) => [row.key, row.id, row.archived, row.price]),
      [
        ['apparel_size:s', 'v-s', false, '999'],
        ['apparel_size:m', 'v-m', false, '1299'],
        // Choosing the archived variant's option brings it back by its id.
        ['apparel_size:l', 'v-l', true, '1299'],
      ]
    )
    const added = buildRows(
      product({
        variants: [
          variant({ price: { amount_minor: 50_000, currency: 'NPR' }, weight_grams: 200 }),
        ],
      }),
      ['apparel_size'],
      { apparel_size: ['s', 'm'] },
      ATTRIBUTES,
      []
    )
    assert.deepEqual(
      added.map((row) => [row.id, row.sku, row.price, row.weight]),
      [
        [null, 'DN-ABCDEFGH-S', '500', '200'],
        [null, 'DN-ABCDEFGH-M', '500', '200'],
      ]
    )
  })

  test('T-UI-043 an active variant is reused before an archived one of the same combination', ({
    assert,
  }) => {
    const both = product({
      option_axes: ['apparel_size'],
      variants: [
        sized('v-old', 'm', { status: 'archived', has_history: true }),
        sized('v-new', 'm'),
      ],
    })
    const [row] = buildRows(both, ['apparel_size'], { apparel_size: ['m'] }, ATTRIBUTES, [])
    assert.equal(row.id, 'v-new')
    assert.isFalse(row.archived)
  })

  test('T-UI-043 a saved set that is not the whole grid starts as saved, and sends nothing', ({
    assert,
  }) => {
    const sparse = product({
      option_axes: ['apparel_size', 'color'],
      variants: [
        sized('v-sb', 's', { option_value_codes: { apparel_size: 's', color: 'black' } }),
        sized('v-mw', 'm', { option_value_codes: { apparel_size: 'm', color: 'white' } }),
      ],
    })
    const start = variantValuesFrom(sparse, ATTRIBUTES)
    assert.deepEqual(
      start.rows.map((row) => row.id),
      ['v-sb', 'v-mw']
    )
    assert.isTrue(sameAsSaved(variantsBody(start), sparse))
    // Every saved set starts unchanged.
    for (const saved of [SIZED, product()]) {
      assert.isTrue(sameAsSaved(variantsBody(variantValuesFrom(saved, ATTRIBUTES)), saved))
    }
  })

  test('T-UI-043 a new combination with a retired value is left out; a variant that has one keeps it', ({
    assert,
  }) => {
    const withRetired = product({
      option_axes: ['apparel_size', 'color'],
      variants: [
        sized('v-xb', 'xxl', { option_value_codes: { apparel_size: 'xxl', color: 'black' } }),
      ],
    })
    const rows = buildRows(
      withRetired,
      ['apparel_size', 'color'],
      { apparel_size: ['xxl'], color: ['black', 'white'] },
      ATTRIBUTES,
      []
    )
    assert.deepEqual(
      rows.map((row) => [row.key, row.id]),
      [['apparel_size:xxl|color:black', 'v-xb']]
    )
  })

  test('T-UI-043 a suggested SKU never repeats one in the grid', ({ assert }) => {
    const taken = product({
      variants: [
        variant({ sku: 'DN-ABCDEFGH' }),
        sized('v-x', 'm', { sku: 'DN-ABCDEFGH-S', status: 'archived' }),
      ],
      option_axes: [],
    })
    const rows = buildRows(
      { ...taken, option_axes: ['apparel_size'] },
      ['apparel_size'],
      { apparel_size: ['s', 'm'] },
      ATTRIBUTES,
      []
    )
    const skus = rows.map((row) => row.sku)
    assert.equal(new Set(skus).size, skus.length)
  })

  test('T-UI-043 each row’s checks mirror the server’s', ({ assert }) => {
    const rows = [{ sku: 'TEE-S' }, { sku: 'TEE-S' }, { sku: 'TEE-M' }] as VariantRow[]
    assert.equal(skuProblem('', rows, 0), 'sku_required')
    assert.equal(skuProblem('-bad', rows, 0), 'sku_invalid')
    assert.equal(skuProblem('x'.repeat(VARIANT_LIMITS.sku.max + 1), rows, 0), 'sku_invalid')
    assert.isNull(skuProblem('TEE-S', rows, 0))
    assert.equal(skuProblem('TEE-S', rows, 1), 'sku_duplicate')

    assert.equal(priceProblem('', false), 'price_required')
    assert.equal(priceProblem('12.345', false), 'price_invalid')
    assert.equal(priceProblem('10000001', false), 'price_invalid')
    assert.isNull(priceProblem('0', false))
    assert.equal(priceProblem('0', true), 'price_positive')
    assert.isNull(priceProblem('1,299.50', true))

    assert.isNull(compareAtProblem('', '1299'))
    assert.equal(compareAtProblem('abc', '1299'), 'compare_at_invalid')
    assert.equal(compareAtProblem('1299', '1299'), 'compare_at_not_above')
    assert.isNull(compareAtProblem('1499', '1299'))

    assert.isNull(weightProblem(''))
    assert.equal(weightProblem('0'), 'weight_invalid')
    assert.equal(weightProblem('250.5'), 'weight_invalid')
    assert.equal(weightProblem('50001'), 'weight_invalid')
    assert.isNull(weightProblem('50000'))
  })

  test('T-UI-043 the set’s checks: values for each option, 1 to 100 variants, a live product’s required options', ({
    assert,
  }) => {
    const options = axisOptionsFor(TEES, ATTRIBUTES, product())
    const empty = { axes: ['apparel_size'], values: { apparel_size: [] }, rows: [] }
    assert.equal(setProblem(empty, options, false), 'no_values')
    const many = {
      axes: [],
      values: {},
      rows: Array.from({ length: VARIANT_LIMITS.variants.max + 1 }, () => ({}) as VariantRow),
    }
    assert.equal(setProblem(many, options, false), 'too_many')
    // Values chosen, but every combination is new with a retired value: no row to send.
    const none = { axes: ['apparel_size'], values: { apparel_size: ['xxl'] }, rows: [] }
    assert.equal(setProblem(none, options, false), 'no_rows')
    const plain = variantValuesFrom(product(), ATTRIBUTES)
    assert.isNull(setProblem(plain, options, false))
    assert.equal(setProblem(plain, options, true), 'required_axis')
  })

  test('T-UI-043 the body: every row in grid order, prices in paisa, ids of the variants kept', ({
    assert,
  }) => {
    const values = variantValuesFrom(SIZED, ATTRIBUTES)
    values.rows[0] = { ...values.rows[0], price: '1,299.50', compareAt: '1499', weight: '180' }
    const extra = buildRows(
      SIZED,
      ['apparel_size'],
      { apparel_size: ['s', 'm', 'l'] },
      ATTRIBUTES,
      values.rows
    )
    const body = variantsBody({ ...values, values: { apparel_size: ['s', 'm', 'l'] }, rows: extra })
    assert.deepEqual(body, {
      option_axes: ['apparel_size'],
      variants: [
        {
          id: 'v-s',
          option_value_codes: { apparel_size: 's' },
          sku: 'TEE-S',
          price_minor: 129_950,
          compare_at_price_minor: 149_900,
          weight_grams: 180,
        },
        {
          id: 'v-m',
          option_value_codes: { apparel_size: 'm' },
          sku: 'TEE-M',
          price_minor: 129_900,
          compare_at_price_minor: null,
          weight_grams: null,
        },
        {
          id: 'v-l',
          option_value_codes: { apparel_size: 'l' },
          sku: 'TEE-L',
          price_minor: 129_900,
          compare_at_price_minor: null,
          weight_grams: null,
        },
      ],
    })
  })

  test('T-UI-043 the saved set, in any order, is no change; a new price is', ({ assert }) => {
    const values = variantValuesFrom(SIZED, ATTRIBUTES)
    assert.isTrue(sameAsSaved(variantsBody(values), SIZED))
    const reversed = { ...values, rows: [...values.rows].reverse() }
    assert.isTrue(sameAsSaved(variantsBody(reversed), SIZED))
    const repriced = { ...values, rows: [{ ...values.rows[0], price: '1399' }, values.rows[1]] }
    assert.isFalse(sameAsSaved(variantsBody(repriced), SIZED))
    const dropped = { ...values, values: { apparel_size: ['s'] }, rows: [values.rows[0]] }
    assert.isFalse(sameAsSaved(variantsBody(dropped), SIZED))
  })

  test('T-UI-043 a 412 lists what was saved differently: the options, the variants', ({
    assert,
  }) => {
    assert.deepEqual(variantConflictFields(SIZED, { ...SIZED, version: 5 }), [])
    const repriced = {
      ...SIZED,
      variants: SIZED.variants.map((item) =>
        item.id === 'v-s' ? { ...item, price: { amount_minor: 99_900, currency: 'NPR' } } : item
      ),
    }
    assert.deepEqual(variantConflictFields(SIZED, repriced), ['variants'])
    const twoAxes = { ...SIZED, option_axes: ['apparel_size', 'color'] }
    assert.deepEqual(variantConflictFields(SIZED, twoAxes), ['options'])
    assert.deepEqual(variantConflictFields(product(), SIZED), ['options', 'variants'])
  })

  test('T-UI-043 the options are fixed once any variant has history', ({ assert }) => {
    assert.isTrue(axesLocked(SIZED))
    assert.isFalse(axesLocked(product()))
  })

  test('T-UI-043 a server error lands on its row by the order sent, or on the options', ({
    assert,
  }) => {
    assert.equal(variantFieldOf('variants.1.sku', 3), 'rows.1.sku')
    assert.equal(variantFieldOf('variants.0.price_minor', 3), 'rows.0.price')
    assert.equal(variantFieldOf('variants.2.compare_at_price_minor', 3), 'rows.2.compareAt')
    assert.equal(variantFieldOf('variants.2.weight_grams', 3), 'rows.2.weight')
    assert.equal(variantFieldOf('option_axes', 3), 'axes')
    assert.equal(variantFieldOf('option_axes.1', 3), 'axes')
    // A combination, a variant listed twice, an index not sent and the backstop: the summary.
    assert.isNull(variantFieldOf('variants.0.option_value_codes', 3))
    assert.isNull(variantFieldOf('variants.0.id', 3))
    assert.isNull(variantFieldOf('variants.5.sku', 3))
    assert.isNull(variantFieldOf('variants', 3))
    assert.isNull(variantFieldOf(null, 3))
  })
})

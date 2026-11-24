import { test } from '@japa/runner'
import { checkProductAttributes, type EffectiveRule } from '#modules/catalog/domain/attribute_rules'
import { originProblems } from '#modules/catalog/domain/disclosures'
import { PUBLIC_ID_PATTERN, newPublicId, productSlug } from '#modules/catalog/domain/identifiers'
import { missingForSubmit } from '#modules/catalog/domain/submit_readiness'
import { optionSignature } from '#modules/catalog/domain/option_signature'

/*
 * The catalog's pure product rules (R1-S parts 2a and 2b): T-CAT-002
 * (`missingForSubmit`), T-CAT-007 (`public_id` generation), T-CAT-104 (the
 * attribute rule function; the inheritance query is tested on the seeded
 * tree in tests/functional/catalog/products.spec.ts), the origin rule of
 * `products_country_check`, and T-CAT-102's option signature.
 */

const complete = {
  description: 'Text',
  manufacturerName: 'Maker',
  warrantyText: 'No warranty',
  careAndPrecautions: 'Wash cold',
  isImported: false,
  countryOfOrigin: 'NP',
}

test.group('T-CAT-002 missingForSubmit', () => {
  test('T-CAT-002 lists variants, media, then each missing disclosure, in order', ({ assert }) => {
    assert.deepEqual(
      missingForSubmit(
        {
          description: null,
          manufacturerName: null,
          warrantyText: null,
          careAndPrecautions: null,
          isImported: true,
          countryOfOrigin: null,
        },
        [{ status: 'active', priceMinor: 0 }],
        0
      ),
      [
        'variants',
        'media',
        'description',
        'manufacturer_name',
        'warranty_text',
        'care_and_precautions',
        'country_of_origin',
      ]
    )
  })

  test('T-CAT-002 a complete product with a priced active variant and an image misses nothing', ({
    assert,
  }) => {
    assert.deepEqual(missingForSubmit(complete, [{ status: 'active', priceMinor: 100 }], 1), [])
    assert.deepEqual(
      missingForSubmit(complete, [{ status: 'archived', priceMinor: 100 }], 1),
      ['variants'],
      'no active variant'
    )
    assert.deepEqual(
      missingForSubmit(
        { ...complete, countryOfOrigin: null },
        [{ status: 'active', priceMinor: 1 }],
        1
      ),
      [],
      'a domestic product needs no country to submit'
    )
  })
})

test.group('T-CAT-007 public_id and slug', () => {
  test('T-CAT-007 public_id is 8 Crockford base32 characters', ({ assert }) => {
    for (let n = 0; n < 200; n++) assert.match(newPublicId(), PUBLIC_ID_PATTERN)
  })

  test('T-CAT-007 the slug follows the title, or is product', ({ assert }) => {
    assert.equal(productSlug('  Café Crème — Tee!! '), 'cafe-creme-tee')
    assert.equal(productSlug('सुती टिसर्ट'), 'product')
    assert.equal(productSlug('a'.repeat(100)).length, 80)
    assert.match(productSlug(`${'ab-'.repeat(40)}x`), /^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
})

const rule = (code: string, extra: Partial<EffectiveRule> = {}): EffectiveRule => ({
  attributeId: `${code}-id`,
  code,
  name: code[0].toUpperCase() + code.slice(1),
  input: 'multi',
  usage: 'product',
  isRequired: false,
  ...extra,
})

const RULES = new Map([
  ['audience', rule('audience', { isRequired: true })],
  ['fit', rule('fit', { input: 'single' })],
  ['color', rule('color', { input: 'single', usage: 'variant_axis' })],
])
const VALUES = new Map([
  [
    'audience',
    new Map([
      ['men', { id: 'men-id', isActive: true }],
      ['kids', { id: 'kids-id', isActive: false }],
    ]),
  ],
  [
    'fit',
    new Map([
      ['slim', { id: 'slim-id', isActive: true }],
      ['regular', { id: 'regular-id', isActive: true }],
    ]),
  ],
])

test.group('T-CAT-104 product attribute rules', () => {
  test('T-CAT-104 resolves the allowed values', ({ assert }) => {
    const result = checkProductAttributes({
      rules: RULES,
      values: VALUES,
      requested: [
        { code: 'audience', valueCodes: ['men'] },
        { code: 'fit', valueCodes: ['slim'] },
      ],
      complete: true,
    })
    assert.deepEqual(result.problems, [])
    assert.deepEqual(result.resolved, [
      { attributeId: 'audience-id', valueId: 'men-id' },
      { attributeId: 'fit-id', valueId: 'slim-id' },
    ])
  })

  test('T-CAT-104 refuses a variant axis, an unknown attribute, two single values and an inactive value', ({
    assert,
  }) => {
    const result = checkProductAttributes({
      rules: RULES,
      values: VALUES,
      requested: [
        { code: 'color', valueCodes: ['black'] },
        { code: 'sleeve_length', valueCodes: ['long'] },
        { code: 'fit', valueCodes: ['slim', 'regular'] },
        { code: 'audience', valueCodes: ['kids'] },
      ],
      complete: false,
    })
    assert.deepEqual(
      result.problems.map((problem) => [problem.field, problem.code]),
      [
        ['attributes.0.attribute_code', 'not_allowed'],
        ['attributes.1.attribute_code', 'not_allowed'],
        ['attributes.2.value_codes', 'too_many'],
        ['attributes.3.value_codes', 'unknown_value'],
      ]
    )
  })

  test('T-CAT-104 an inactive value already on the product may stay; a live product needs the required ones', ({
    assert,
  }) => {
    const kept = checkProductAttributes({
      rules: RULES,
      values: VALUES,
      requested: [{ code: 'audience', valueCodes: ['kids'] }],
      kept: new Set(['kids-id']),
      complete: true,
    })
    assert.deepEqual(kept.problems, [])
    const missing = checkProductAttributes({
      rules: RULES,
      values: VALUES,
      requested: [{ code: 'fit', valueCodes: ['slim'] }],
      complete: true,
    })
    assert.deepEqual(
      missing.problems.map((problem) => [problem.field, problem.code]),
      [['attributes', 'required']]
    )
  })
})

test.group('T-CAT-008 the origin rule of products_country_check', () => {
  test('T-CAT-008 a country, when given, agrees with is_imported', ({ assert }) => {
    assert.deepEqual(originProblems({ isImported: false, countryOfOrigin: null }), [])
    assert.deepEqual(originProblems({ isImported: false, countryOfOrigin: 'NP' }), [])
    assert.deepEqual(originProblems({ isImported: true, countryOfOrigin: 'IN' }), [])
    assert.lengthOf(originProblems({ isImported: true, countryOfOrigin: 'NP' }), 1)
    assert.lengthOf(originProblems({ isImported: false, countryOfOrigin: 'CN' }), 1)
  })
})

test.group('T-CAT-102 option signature', () => {
  test('T-CAT-102 pairs sorted by attribute code, joined with |; empty for no options', ({
    assert,
  }) => {
    assert.equal(
      optionSignature({ color: 'black', apparel_size: 'm' }),
      'apparel_size:m|color:black'
    )
    assert.equal(
      optionSignature({ apparel_size: 'm', color: 'black' }),
      optionSignature({ color: 'black', apparel_size: 'm' }),
      'the axis order does not matter'
    )
    assert.equal(optionSignature({}), '')
  })
})

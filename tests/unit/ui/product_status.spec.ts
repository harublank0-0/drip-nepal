import { test } from '@japa/runner'
import { PRODUCT_STATUSES } from '#modules/catalog/domain/product_status'
import {
  attributeMessage,
  gateFix,
  MOVE_PERMISSION,
  needsReview,
  PRODUCT_MOVES,
  productMoves,
} from '#shared/ui/product_status'

/*
 * T-UI-044 (docs/10 §6.9; R1-S part 2f-iii): the product status moves the
 * seller pages offer, and where each item of a refused publish is fixed.
 */
test.group('T-UI-044 product status moves', () => {
  test('T-UI-044 each status offers the moves 05 §6.10 allows, and only those', ({ assert }) => {
    assert.deepEqual(PRODUCT_MOVES, {
      draft: ['publish'],
      published: ['unpublish', 'archive'],
      unpublished: ['publish', 'archive'],
      archived: ['restore'],
    })
    // Every other status leaves by review, an edit or staff.
    for (const status of PRODUCT_STATUSES) {
      if (status in PRODUCT_MOVES) continue
      assert.deepEqual(
        productMoves(status, 'active', () => true),
        [],
        status
      )
    }
  })

  test('T-UI-044 a move needs its permission, and the shop open to catalogue changes', ({
    assert,
  }) => {
    assert.deepEqual(MOVE_PERMISSION, {
      publish: 'shop.products.publish',
      unpublish: 'shop.products.publish',
      archive: 'shop.products.edit',
      restore: 'shop.products.edit',
    })
    const editOnly = (permission: string) => permission === 'shop.products.edit'
    const publishOnly = (permission: string) => permission === 'shop.products.publish'
    assert.deepEqual(productMoves('published', 'active', editOnly), ['archive'])
    assert.deepEqual(productMoves('published', 'active', publishOnly), ['unpublish'])
    assert.deepEqual(
      productMoves('unpublished', 'active', () => true),
      ['publish', 'archive']
    )
    assert.deepEqual(productMoves('archived', 'active', publishOnly), [])
    // A suspended shop may still read its catalogue, but changes nothing.
    assert.deepEqual(
      productMoves('published', 'suspended', () => true),
      []
    )
    assert.deepEqual(
      productMoves('draft', 'pending_review', () => true),
      []
    )
  })

  test('T-UI-044 a draft that has to be reviewed first is told apart from a status that moved', ({
    assert,
  }) => {
    const refused = (allowed: unknown) => ({
      code: 'INVALID_STATE_TRANSITION',
      allowed_events: allowed,
    })
    assert.isTrue(needsReview(refused(['submit'])))
    assert.isFalse(needsReview(refused(['publish'])))
    assert.isFalse(needsReview(refused([])))
    assert.isFalse(needsReview(refused(undefined)))
    assert.isFalse(needsReview({ code: 'VALIDATION_FAILED', allowed_events: ['submit'] }))
  })

  test('T-UI-044 each item of a refused publish names where it is fixed', ({ assert }) => {
    for (const field of [
      'description',
      'manufacturer_name',
      'warranty_text',
      'care_and_precautions',
      'country_of_origin',
      'category_id',
      'brand_id',
      'attributes',
    ]) {
      assert.deepEqual(gateFix(field), { kind: 'details', field })
    }
    assert.deepEqual(gateFix('variants'), { kind: 'variants' })
    assert.deepEqual(gateFix('option_axes'), { kind: 'variants' })
    assert.deepEqual(gateFix('media'), { kind: 'photos' })
    assert.deepEqual(gateFix('agreement'), { kind: 'agreement' })
    assert.deepEqual(gateFix('shipping'), { kind: 'shipping' })
    assert.deepEqual(gateFix('something_new'), { kind: 'none' })
  })

  test('T-UI-044 an attribute’s problem reads with the attribute’s name when it is known', ({
    assert,
  }) => {
    const nameOf = (code: string) => (code === 'material' ? 'Material' : undefined)
    assert.equal(
      attributeMessage('material: This category does not use this attribute.', nameOf),
      'Material: This category does not use this attribute.'
    )
    assert.equal(
      attributeMessage('sleeve_length: This category does not use this attribute.', nameOf),
      'sleeve_length: This category does not use this attribute.'
    )
    assert.equal(
      attributeMessage('Fill this in before you publish.', nameOf),
      'Fill this in before you publish.'
    )
  })
})

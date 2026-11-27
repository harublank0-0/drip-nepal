import { test } from '@japa/runner'
import { VENDOR_ADJUSTMENT_REASONS } from '#modules/inventory/domain/movement_reasons'
import { STOCK_LIMITS } from '#shared/constants/limits'
import {
  adjustBody,
  belowReservedCopy,
  belowReservedOf,
  movementDelta,
  quantityProblem,
  REASONS_FOR,
  reasonFor,
  stockChangedOf,
  stockChangesOffered,
} from '#shared/ui/stock'

/*
 * T-UI-045 (docs/10 §6.9; R1-S part 2f-iv-a): the stock page's dialog rules.
 */
test.group('T-UI-045 stock dialog rules', () => {
  test('T-UI-045 each direction offers the reasons that fit it; a mistake is corrected either way', ({
    assert,
  }) => {
    assert.deepEqual(REASONS_FOR.add, ['received_stock', 'found', 'data_entry_error'])
    assert.deepEqual(REASONS_FOR.remove, ['sold_offline', 'damaged', 'lost', 'data_entry_error'])
    // Every vendor reason is offered somewhere.
    assert.sameMembers(
      [...new Set([...REASONS_FOR.add, ...REASONS_FOR.remove])],
      [...VENDOR_ADJUSTMENT_REASONS]
    )
    assert.equal(reasonFor('remove', 'data_entry_error'), 'data_entry_error')
    assert.equal(reasonFor('remove', 'received_stock'), '')
    assert.equal(reasonFor('add', ''), '')
  })

  test('T-UI-045 a quantity is whole units from its minimum to the column’s limit', ({
    assert,
  }) => {
    assert.equal(quantityProblem('', 1), 'required')
    assert.equal(quantityProblem('  ', 0), 'required')
    assert.equal(quantityProblem('2.5', 1), 'invalid')
    assert.equal(quantityProblem('-3', 1), 'invalid')
    assert.equal(quantityProblem('1e3', 1), 'invalid')
    assert.equal(quantityProblem('0', 1), 'too_small')
    assert.isNull(quantityProblem('0', 0))
    assert.isNull(quantityProblem(' 12 ', 1))
    assert.isNull(quantityProblem(String(STOCK_LIMITS.units.max), 1))
    assert.equal(quantityProblem(String(STOCK_LIMITS.units.max + 1), 1), 'too_large')
  })

  test('T-UI-045 an adjustment is sent as a signed delta; a blank note is no note', ({
    assert,
  }) => {
    assert.deepEqual(
      adjustBody({ direction: 'add', quantity: ' 5 ', reason: 'received_stock', note: '  ' }),
      { delta: 5, reason_code: 'received_stock', note: null }
    )
    assert.deepEqual(
      adjustBody({ direction: 'remove', quantity: '2', reason: 'damaged', note: ' Wet box ' }),
      { delta: -2, reason_code: 'damaged', note: 'Wet box' }
    )
  })

  test('T-UI-045 a refusal below reserved and a changed count are read from the 409', ({
    assert,
  }) => {
    const below = {
      code: 'CONFLICT',
      errors: [
        {
          code: 'below_reserved',
          on_hand: 5,
          reserved: 3,
          reserved_committed: 2,
          committed_shop_orders: ['DN-7Q4K2MX-1', 7],
          reserved_held: 1,
        },
      ],
    }
    assert.deepEqual(belowReservedOf(below), {
      onHand: 5,
      reserved: 3,
      committed: 2,
      orders: ['DN-7Q4K2MX-1'],
      held: 1,
    })
    assert.isNull(belowReservedOf({ code: 'VALIDATION_FAILED', errors: below.errors }))
    assert.isNull(belowReservedOf({ code: 'CONFLICT', errors: [{ code: 'stock_changed' }] }))
    const changed = {
      code: 'CONFLICT',
      errors: [{ code: 'stock_changed', on_hand: 11, reserved: 2 }],
    }
    assert.deepEqual(stockChangedOf(changed), { onHand: 11, reserved: 2 })
    assert.isNull(stockChangedOf(below))
    assert.isNull(stockChangedOf({ code: 'CONFLICT', errors: [{ code: 'stock_changed' }] }))
    // An item without its numbers is no refusal to show.
    assert.isNull(belowReservedOf({ code: 'CONFLICT', errors: [{ code: 'below_reserved' }] }))
  })

  test('T-UI-045 the refusal reads as 05 §8.13 words it, from the number it would have set', ({
    assert,
  }) => {
    const refusal = (committed: number, held: number, orders: string[] = []) => ({
      onHand: 5,
      reserved: committed + held,
      committed,
      orders,
      held,
    })
    assert.deepEqual(belowReservedCopy(refusal(0, 0), -1), {
      key: 'below_zero',
      values: { target: -1 },
    })
    assert.deepEqual(belowReservedCopy(refusal(3, 0, ['DN-A-2', 'DN-A-1']), 2), {
      key: 'reserved_for_orders',
      values: { target: 2, reserved: 3, orders: ' DN-A-2 and DN-A-1' },
    })
    assert.deepEqual(belowReservedCopy(refusal(2, 0, ['DN-A-3', 'DN-A-2', 'DN-A-1']), 1).values, {
      target: 1,
      reserved: 2,
      orders: ' DN-A-3, DN-A-2 and DN-A-1',
    })
    assert.deepEqual(belowReservedCopy(refusal(0, 2), 1), {
      key: 'reserved_for_payment',
      values: { target: 1, reserved: 2 },
    })
    assert.deepEqual(belowReservedCopy(refusal(2, 1, ['DN-A-2']), 2), {
      key: 'reserved_split',
      values: { target: 2, reserved: 3, committed: 2, orders: ' DN-A-2', held: 1 },
    })
  })

  test('T-UI-045 the last change names a number only when one moved; the changes need their permission', ({
    assert,
  }) => {
    assert.deepEqual(movementDelta({ on_hand_delta: 5, reserved_delta: 0 }), {
      column: 'on_hand',
      delta: 5,
    })
    assert.deepEqual(movementDelta({ on_hand_delta: 0, reserved_delta: -2 }), {
      column: 'reserved',
      delta: -2,
    })
    // A count that confirmed the number, and a commit, move nothing.
    assert.isNull(movementDelta({ on_hand_delta: 0, reserved_delta: 0 }))
    const adjuster = (permission: string) => permission === 'shop.inventory.adjust'
    assert.isTrue(stockChangesOffered('active', adjuster))
    assert.isFalse(stockChangesOffered('active', () => false))
    assert.isFalse(stockChangesOffered('suspended', adjuster))
    assert.isFalse(stockChangesOffered('pending_review', adjuster))
  })
})

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  insertInventoryItem,
  insertOrderLine,
  insertShop,
  insertShopOrder,
  insertVariant,
  refused,
  type Row,
} from '#tests/support/schema_rows'

/*
 * Constraint tests of `inventory_items` and `inventory_reservations`
 * (docs/04a §8.1, §8.2), the baseline constraint tests that ADR-0011
 * "Verification" lists for these tables: T-ORD-104 (composite FK) and the
 * stock CHECK under T-INV-003.
 *
 * Rows are inserted directly, as the runtime would, and each test is rolled
 * back. Every expected refusal runs in its own savepoint and asserts the
 * SQLSTATE and, where PostgreSQL reports one, the constraint name. Valid rows
 * are accepted first, so each refusal is about the one thing it breaks.
 */

test.group('T-ORD-104 cross-shop reservation rows', () => {
  test('T-ORD-104 cross-shop reservation rows give 23503', async ({ assert }) => {
    const shopA = await insertShop()
    const shopB = await insertShop()

    // Shop A: two orders, each with one line and the line's stock.
    const first = await insertShopOrder(shopA)
    const firstLine = await insertOrderLine(first)
    await insertInventoryItem(shopA, firstLine.variantId, { on_hand: 5 })
    const second = await insertShopOrder(shopA)
    const secondLine = await insertOrderLine(second)
    await insertInventoryItem(shopA, secondLine.variantId, { on_hand: 5 })

    // Shop B: a variant with stock of its own.
    const { variantId: variantB } = await insertVariant(shopB)
    await insertInventoryItem(shopB, variantB, { on_hand: 5 })

    // A COD hold of shop A's first line is accepted.
    await db.table('inventory_reservations').insert({
      shop_id: shopA,
      variant_id: firstLine.variantId,
      order_id: first.orderId,
      order_item_id: firstLine.id,
      quantity: 2,
      status: 'committed',
    })

    // Each refusal holds stock against shop A's second line, which has no
    // open reservation, so `inventory_reservations_open_item_key` stays clear.
    const hold = (values: Row) => ({
      shop_id: shopA,
      variant_id: secondLine.variantId,
      order_id: second.orderId,
      order_item_id: secondLine.id,
      quantity: 2,
      status: 'committed',
      ...values,
    })
    const cases: [string, Row, string | undefined][] = [
      [
        "shop B's variant and stock held against shop A's order line",
        { shop_id: shopB, variant_id: variantB },
        'inventory_reservations_order_item_fkey',
      ],
      [
        "shop A's order line held for shop A with shop B's variant",
        { variant_id: variantB },
        // Both keys refuse it; PostgreSQL reports whichever runs first.
        undefined,
      ],
      [
        "shop A's order line held for shop B",
        { shop_id: shopB },
        // Both keys refuse it, as above.
        undefined,
      ],
      [
        "the line under another order's id",
        { order_id: first.orderId },
        'inventory_reservations_order_item_fkey',
      ],
      [
        "the line holding another line's variant",
        { variant_id: firstLine.variantId },
        'inventory_reservations_order_item_fkey',
      ],
    ]
    for (const [label, values, constraint] of cases) {
      await refused(
        assert,
        (trx) => trx.table('inventory_reservations').insert(hold(values)),
        { code: '23503', constraint },
        label
      )
    }

    // The same line with its own order, shop and variant is accepted.
    await db.table('inventory_reservations').insert(hold({}))
    const held = await db
      .from('inventory_reservations')
      .whereIn('order_item_id', [firstLine.id, secondLine.id])
    assert.lengthOf(held, 2)
  })
})

/*
 * The stock CHECK that ADR-0011 "Verification" names T-INV-003. The docs/10
 * §6 row of T-INV-003 is the concurrency test of docs/05 §4.9 (twenty
 * checkouts for the last unit), which comes with checkout in M4. This group
 * is only its CHECK backstop: `inventory_items_reserved_check` refuses a
 * promise of more units than are on hand when a code path skips the guard
 * `WHERE on_hand - reserved >= :qty` (docs/04a §8.1, docs/05 §4.5).
 */
test.group('T-INV-003 inventory_items stock CHECK backstop', () => {
  test('T-INV-003 more reserved than on hand, or negative stock, gives 23514', async ({
    assert,
  }) => {
    const shopId = await insertShop()
    const variants: string[] = []
    for (let i = 0; i < 6; i++) {
      const { variantId } = await insertVariant(shopId)
      variants.push(variantId)
    }
    const [empty, lastUnit, partly, ...fresh] = variants

    // A never-stocked row, the last unit promised, and stock partly reserved.
    await insertInventoryItem(shopId, empty)
    await insertInventoryItem(shopId, lastUnit, { on_hand: 1, reserved: 1 })
    await insertInventoryItem(shopId, partly, { on_hand: 5, reserved: 2 })

    const inserts: [string, string, Row, string][] = [
      [
        'reserved above on_hand',
        fresh[0],
        { on_hand: 1, reserved: 2 },
        'inventory_items_reserved_check',
      ],
      ['negative on_hand', fresh[1], { on_hand: -1 }, 'inventory_items_on_hand_check'],
      [
        'negative reserved',
        fresh[2],
        { on_hand: 1, reserved: -1 },
        'inventory_items_reserved_check',
      ],
    ]
    for (const [label, variantId, values, constraint] of inserts) {
      await refused(
        assert,
        (trx) =>
          trx
            .table('inventory_items')
            .insert({ variant_id: variantId, shop_id: shopId, ...values }),
        { code: '23514', constraint },
        label
      )
    }

    const updates: [string, string, Row, string][] = [
      // Checkout's reserve without its guard (docs/05 §4.5) on the last unit.
      [
        'reserving one more than on hand',
        lastUnit,
        { reserved: db.raw('reserved + 1'), version: db.raw('version + 1') },
        'inventory_items_reserved_check',
      ],
      // A ship or adjustment that takes on_hand below what is promised.
      [
        'on_hand below reserved',
        partly,
        { on_hand: db.raw('on_hand - 4') },
        'inventory_items_reserved_check',
      ],
      [
        'releasing more than reserved',
        partly,
        { reserved: db.raw('reserved - 3') },
        'inventory_items_reserved_check',
      ],
    ]
    for (const [label, variantId, values, constraint] of updates) {
      await refused(
        assert,
        (trx) => trx.from('inventory_items').where('variant_id', variantId).update(values),
        { code: '23514', constraint },
        label
      )
    }

    // Nothing was promised beyond the shelf.
    const rows = await db
      .from('inventory_items')
      .whereIn('variant_id', variants)
      .orderBy('on_hand')
      .select('variant_id', 'on_hand', 'reserved', 'version')
    assert.deepEqual(rows, [
      { variant_id: empty, on_hand: 0, reserved: 0, version: 1 },
      { variant_id: lastUnit, on_hand: 1, reserved: 1, version: 1 },
      { variant_id: partly, on_hand: 5, reserved: 2, version: 1 },
    ])
  })
})

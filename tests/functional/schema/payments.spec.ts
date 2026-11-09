import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  insertCodPayment,
  insertShop,
  insertShopOrder,
  refused,
  type Row,
} from '#tests/support/schema_rows'

/*
 * The refund CHECK backstop of `payments` and `payment_allocations`
 * (docs/04a §12.1, §12.2; INV-11 in docs/04 §16.3), the baseline constraint
 * test that ADR-0011 "Verification" names T-SEC-004.
 *
 * The docs/10 §6 row of T-SEC-004 is "Refund above refundable gives 422
 * `REFUND_EXCEEDS_REFUNDABLE`; CHECK backstop". The 422 part needs the refund
 * actions and comes with them in M7. This group is only the CHECK backstop:
 * a refund that succeeds raises `refunded_minor` on the payment and its
 * allocation (docs/04a §12.4), and the CHECKs stop it above what was
 * captured or collected when a code path skips the refundable check.
 *
 * Rows are inserted directly, as the runtime would, and each test is rolled
 * back. Every expected refusal runs in its own savepoint and asserts the
 * SQLSTATE and the constraint name. Valid rows are accepted first.
 */
test.group('T-SEC-004 refund CHECK backstop', () => {
  test('T-SEC-004 refunded above captured gives 23514 on the payment and its allocation', async ({
    assert,
  }) => {
    const shopId = await insertShop()
    const collectedOrder = await insertShopOrder(shopId)
    const collected = await insertCodPayment(collectedOrder, true)
    const uncollectedOrder = await insertShopOrder(shopId)
    const uncollected = await insertCodPayment(uncollectedOrder, false)

    // A full refund of the collected cash is accepted on both rows.
    await db.from('payments').where('id', collected).update({ refunded_minor: 110000 })
    await db
      .from('payment_allocations')
      .where('payment_id', collected)
      .update({ refunded_minor: 110000 })

    const cases: [string, string, string, Row, string][] = [
      [
        'one paisa above the cash collected',
        'payments',
        collected,
        { refunded_minor: 110001 },
        'payments_refunded_le_captured_check',
      ],
      [
        'a refund of cash never collected',
        'payments',
        uncollected,
        { refunded_minor: 1 },
        'payments_refunded_le_captured_check',
      ],
      [
        'a negative refunded amount',
        'payments',
        collected,
        { refunded_minor: -1 },
        'payments_refunded_le_captured_check',
      ],
      [
        'allocation: one paisa above its captured amount',
        'payment_allocations',
        collected,
        { refunded_minor: 110001 },
        'payment_allocations_amounts_check',
      ],
      [
        'allocation: a refund of cash never collected',
        'payment_allocations',
        uncollected,
        { refunded_minor: 1 },
        'payment_allocations_amounts_check',
      ],
    ]
    for (const [label, table, paymentId, values, constraint] of cases) {
      const key = table === 'payments' ? 'id' : 'payment_id'
      await refused(
        assert,
        (trx) => trx.from(table).where(key, paymentId).update(values),
        { code: '23514', constraint },
        label
      )
    }

    // Refunded amounts are as accepted.
    const payments = await db
      .from('payments')
      .whereIn('id', [collected, uncollected])
      .orderBy('refunded_minor')
      .select('id', 'captured_minor', 'refunded_minor')
    assert.deepEqual(payments, [
      { id: uncollected, captured_minor: 0, refunded_minor: 0 },
      { id: collected, captured_minor: 110000, refunded_minor: 110000 },
    ])
    const allocations = await db
      .from('payment_allocations')
      .whereIn('payment_id', [collected, uncollected])
      .orderBy('refunded_minor')
      .select('payment_id', 'refunded_minor')
    assert.deepEqual(allocations, [
      { payment_id: uncollected, refunded_minor: 0 },
      { payment_id: collected, refunded_minor: 110000 },
    ])
  })
})

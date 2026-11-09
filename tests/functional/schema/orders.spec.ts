import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  insertLocation,
  insertOrder,
  insertUser,
  orderValues,
  refused,
  type Row,
} from '#tests/support/order_rows'

/*
 * T-ORD-109 (docs/10 §6.4, note 35): the OD-57 verification columns of
 * `orders` (docs/04a §11.1). `orders_verification_check` keeps the flag
 * consistent (INV-33), and `orders_guard` lets staff change the verification
 * columns while every snapshot column stays as placed (INV-08).
 *
 * Every expected refusal runs in its own savepoint and asserts the SQLSTATE
 * and, where PostgreSQL reports one, the constraint name.
 */
test.group('T-ORD-109 orders verification columns', () => {
  test('T-ORD-109 orders_verification_check refuses an inconsistent flag with 23514', async ({
    assert,
  }) => {
    await insertLocation()
    const customerUserId = await insertUser()

    // Each consistent state is accepted, so the refusals below are about the flag alone.
    const valid: Row[] = [
      {},
      { verification_status: 'verified', verification_method: 'phone_call', verified_at: db.raw('now()') },
      { verification_status: 'review_required', verification_method: 'manual' },
      {
        verification_status: 'failed',
        verification_method: 'sms_otp',
        verification_notes: 'No answer on three calls.',
      },
    ]
    for (const values of valid) {
      await db.table('orders').insert(orderValues(customerUserId, values))
    }

    const cases: [string, Row][] = [
      [
        'verified_at without verified',
        {
          verification_status: 'review_required',
          verification_method: 'phone_call',
          verified_at: db.raw('now()'),
        },
      ],
      ['verified_at while pending', { verified_at: db.raw('now()') }],
      ['verified without verified_at', { verification_status: 'verified', verification_method: 'manual' }],
      ['a method while pending', { verification_method: 'phone_call' }],
      [
        'no method after a check (verified)',
        { verification_status: 'verified', verified_at: db.raw('now()') },
      ],
      ['no method after a check (review_required)', { verification_status: 'review_required' }],
      ['no method after a check (failed)', { verification_status: 'failed' }],
      ['an unknown status', { verification_status: 'checked', verification_method: 'manual' }],
      ['an unknown method', { verification_status: 'failed', verification_method: 'email' }],
      ['a note over 500 characters', { verification_notes: 'x'.repeat(501) }],
    ]
    for (const [label, values] of cases) {
      await refused(
        assert,
        (trx) => trx.table('orders').insert(orderValues(customerUserId, values)),
        { code: '23514', constraint: 'orders_verification_check' },
        label
      )
    }
  })

  test('T-ORD-109 the verification columns pass orders_guard; snapshot columns give P0001', async ({
    assert,
  }) => {
    const order = await insertOrder()

    // Staff mark the order for review, then verify it: orders_guard lets both through.
    await db.from('orders').where('id', order.id).update({
      verification_status: 'review_required',
      verification_method: 'phone_call',
      verification_notes: 'Recipient asked to call back.',
    })
    await db.from('orders').where('id', order.id).update({
      verification_status: 'verified',
      verified_at: db.raw('now()'),
    })
    const row = await db.from('orders').where('id', order.id).firstOrFail()
    assert.equal(row.verification_status, 'verified')
    assert.equal(row.verification_method, 'phone_call')
    assert.isNotNull(row.verified_at)

    const cases: [string, Row][] = [
      ['the amounts as placed', { items_subtotal_minor: 90000, grand_total_minor: 100000 }],
      ['the payment method', { payment_method: 'esewa' }],
      ['the order number', { number: 'DN-ZZZZZZZ' }],
      ['the customer', { customer_user_id: await insertUser() }],
      ['the placement time', { placed_at: db.raw(`placed_at - interval '1 day'`) }],
    ]
    for (const [label, values] of cases) {
      await refused(
        assert,
        (trx) => trx.from('orders').where('id', order.id).update(values),
        { code: 'P0001', message: /on orders only .* may change/ },
        label
      )
    }
  })
})

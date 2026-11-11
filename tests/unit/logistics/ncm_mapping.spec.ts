import { test } from '@japa/runner'
import { mapNcmUpdate, normaliseLabel } from '#modules/logistics/providers/ncm_mapping'

/*
 * T-FUL-108: the Nepal Can Move mapping of docs/05 §6.3 is a pure function.
 * Every event and label of the table gives its row's normalised status, an
 * unknown one is unmapped (held with `unmapped_status`), `Delivered` on a
 * `returning` shipment is not a delivery, and `Order Marked Return` on a
 * parcel in transit is `delivery_failed` then `returning`.
 */

test.group('T-FUL-108 NCM mapping: callback events', () => {
  test('{rawEvent} on a {current} shipment')
    .with([
      { rawEvent: 'pickup_completed', current: 'booked', expected: ['shipped'] },
      { rawEvent: 'dropoff_collected', current: 'booked', expected: ['shipped'] },
      { rawEvent: 'sent_for_delivery', current: 'shipped', expected: ['out_for_delivery'] },
      { rawEvent: 'delivery_completed', current: 'out_for_delivery', expected: ['delivered'] },
      {
        rawEvent: 'order_marked_rtv',
        current: 'out_for_delivery',
        expected: ['delivery_failed', 'returning'],
      },
      {
        rawEvent: 'order_marked_rtv',
        current: 'shipped',
        expected: ['delivery_failed', 'returning'],
      },
      { rawEvent: 'order_marked_rtv', current: 'delivery_failed', expected: ['returning'] },
      { rawEvent: 'send_to_vendor', current: 'delivery_failed', expected: ['returning'] },
    ])
    .run(({ assert }, row) => {
      assert.deepEqual(mapNcmUpdate({ rawEvent: row.rawEvent, rawStatus: null }, row.current), {
        kind: 'transition',
        statuses: row.expected,
      })
    })

  test('{rawEvent} moves nothing')
    .with([
      { rawEvent: 'order_dispatched', current: 'shipped', notice: null },
      { rawEvent: 'order_arrived', current: 'shipped', notice: null },
      { rawEvent: 'send_to_vendor', current: 'returning', notice: null },
      { rawEvent: 'order_marked_rtv', current: 'returning', notice: null },
      { rawEvent: 'rtv_delivery', current: 'returning', notice: 'record_returned_to_origin' },
      { rawEvent: 'delivery_completed', current: 'returning', notice: 'record_returned_to_origin' },
      { rawEvent: 'refund_initiated', current: 'delivered', notice: 'courier_refund' },
    ])
    .run(({ assert }, row) => {
      assert.deepEqual(mapNcmUpdate({ rawEvent: row.rawEvent, rawStatus: null }, row.current), {
        kind: 'none',
        notice: row.notice,
      })
    })

  test('an event decides over its display label', ({ assert }) => {
    // NCM's webhook document: "status is a display label"; decide by `event`.
    assert.deepEqual(
      mapNcmUpdate({ rawEvent: 'pickup_completed', rawStatus: 'Delivered' }, 'booked'),
      { kind: 'transition', statuses: ['shipped'] }
    )
  })

  test('an event the table does not know is unmapped, whatever its label', ({ assert }) => {
    assert.deepEqual(
      mapNcmUpdate({ rawEvent: 'returned_to_warehouse', rawStatus: 'Delivered' }, 'shipped'),
      { kind: 'unmapped' }
    )
  })
})

test.group('T-FUL-108 NCM mapping: status labels', () => {
  test('{rawStatus} on a {current} shipment')
    .with([
      { rawStatus: 'Pickup Complete', current: 'booked', expected: ['shipped'] },
      { rawStatus: 'Drop off Order Collected', current: 'booked', expected: ['shipped'] },
      { rawStatus: 'Sent for Delivery', current: 'shipped', expected: ['out_for_delivery'] },
      { rawStatus: 'Delivered', current: 'out_for_delivery', expected: ['delivered'] },
      { rawStatus: 'Delivered', current: 'shipped', expected: ['delivered'] },
      {
        rawStatus: 'Order Marked Return',
        current: 'shipped',
        expected: ['delivery_failed', 'returning'],
      },
      { rawStatus: 'Sent to Vendor', current: 'delivery_failed', expected: ['returning'] },
      { rawStatus: 'Send to Vendor', current: 'out_for_delivery', expected: ['returning'] },
    ])
    .run(({ assert }, row) => {
      assert.deepEqual(mapNcmUpdate({ rawEvent: null, rawStatus: row.rawStatus }, row.current), {
        kind: 'transition',
        statuses: row.expected,
      })
    })

  test('{rawStatus} moves nothing')
    .with([
      { rawStatus: 'Pickup Order Created', current: 'booked', notice: null },
      { rawStatus: 'Drop off Order Created', current: 'booked', notice: null },
      { rawStatus: 'Sent for Pickup', current: 'booked', notice: null },
      { rawStatus: 'Dispatched', current: 'shipped', notice: null },
      { rawStatus: 'Arrived', current: 'shipped', notice: null },
      { rawStatus: 'Delivered', current: 'returning', notice: 'record_returned_to_origin' },
      { rawStatus: 'RTV Delivered', current: 'returning', notice: 'record_returned_to_origin' },
    ])
    .run(({ assert }, row) => {
      assert.deepEqual(mapNcmUpdate({ rawEvent: null, rawStatus: row.rawStatus }, row.current), {
        kind: 'none',
        notice: row.notice,
      })
    })

  test('case and repeated spaces do not matter; other differences do', ({ assert }) => {
    assert.equal(normaliseLabel('  Sent   for DELIVERY '), 'sent for delivery')
    assert.deepEqual(mapNcmUpdate({ rawEvent: null, rawStatus: 'pickup  complete' }, 'booked'), {
      kind: 'transition',
      statuses: ['shipped'],
    })
    for (const rawStatus of [
      'Out for Delivery',
      'Dispatched to POKHARA',
      'Delivery Attempted',
      '',
    ]) {
      assert.deepEqual(mapNcmUpdate({ rawEvent: null, rawStatus }, 'shipped'), { kind: 'unmapped' })
    }
  })

  test('an update with neither event nor label is unmapped', ({ assert }) => {
    assert.deepEqual(mapNcmUpdate({ rawEvent: null, rawStatus: null }, 'shipped'), {
      kind: 'unmapped',
    })
  })
})

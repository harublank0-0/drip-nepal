import { test } from '@japa/runner'
import { mapNcmLabel, normaliseLabel } from '#modules/logistics/providers/ncm_mapping'

/*
 * T-FUL-108 (the mapping part): Nepal Can Move's status labels to
 * normalised statuses, the table of docs/05 §6.3. A pure function of
 * (label, the shipment's current status). The history replay and the
 * return check before `delivered` belong to the job that applies the
 * result, and are tested with it in M6.
 */

test.group('T-FUL-108 NCM mapping', () => {
  test('{label} on a {current} shipment gives {expected}')
    .with([
      { label: 'Pickup Complete', current: 'booked', expected: ['shipped'] },
      { label: 'Drop off Order Collected', current: 'booked', expected: ['shipped'] },
      { label: 'Sent for Delivery', current: 'shipped', expected: ['out_for_delivery'] },
      { label: 'Delivered', current: 'out_for_delivery', expected: ['delivered'] },
      { label: 'Delivered', current: 'shipped', expected: ['delivered'] },
      {
        label: 'Order Marked Return',
        current: 'shipped',
        expected: ['delivery_failed', 'returning'],
      },
      {
        label: 'Order Marked Return',
        current: 'out_for_delivery',
        expected: ['delivery_failed', 'returning'],
      },
      { label: 'Order Marked Return', current: 'delivery_failed', expected: ['returning'] },
      {
        label: 'Sent to Vendor',
        current: 'out_for_delivery',
        expected: ['delivery_failed', 'returning'],
      },
      { label: 'Send to Vendor', current: 'delivery_failed', expected: ['returning'] },
    ])
    .run(({ assert }, row) => {
      assert.deepEqual(mapNcmLabel(row.label, row.current), {
        kind: 'transition',
        statuses: row.expected,
      })
    })

  test('{label} on a {current} shipment moves nothing')
    .with([
      { label: 'Pickup Order Created', current: 'booked', notice: null },
      { label: 'Drop off Order Created', current: 'booked', notice: null },
      { label: 'Sent for Pickup', current: 'booked', notice: null },
      { label: 'Dispatched', current: 'shipped', notice: null },
      { label: 'Arrived', current: 'shipped', notice: null },
      { label: 'Dispatched to POKHARA', current: 'shipped', notice: null },
      { label: 'Arrived at BIRATNAGAR', current: 'shipped', notice: null },
      { label: 'Sent to Vendor', current: 'returning', notice: null },
      { label: 'Order Marked Return', current: 'returning', notice: null },
      { label: 'Delivered', current: 'returning', notice: 'record_returned_to_origin' },
      { label: 'RTV Delivered', current: 'returning', notice: 'record_returned_to_origin' },
      { label: 'Refund Initiated', current: 'delivered', notice: 'courier_refund' },
    ])
    .run(({ assert }, row) => {
      assert.deepEqual(mapNcmLabel(row.label, row.current), { kind: 'none', notice: row.notice })
    })

  test('case and repeated spaces do not matter; other differences do', ({ assert }) => {
    assert.equal(normaliseLabel('  Sent   for DELIVERY '), 'sent for delivery')
    assert.deepEqual(mapNcmLabel('pickup  complete', 'booked'), {
      kind: 'transition',
      statuses: ['shipped'],
    })
    for (const label of ['Out for Delivery', 'Delivery Attempted', 'Dispatchedto X', '']) {
      assert.deepEqual(mapNcmLabel(label, 'shipped'), { kind: 'unmapped' })
    }
  })

  test('callback event names are not labels', ({ assert }) => {
    // NCM does not sign callbacks, so their events are never mapped (05 §6.3).
    for (const event of ['pickup_completed', 'delivery_completed', 'order_marked_rtv']) {
      assert.deepEqual(mapNcmLabel(event, 'shipped'), { kind: 'unmapped' })
    }
  })

  test('a label that names an Object property is not a stage', ({ assert }) => {
    assert.deepEqual(mapNcmLabel('constructor', 'shipped'), { kind: 'unmapped' })
    assert.deepEqual(mapNcmLabel('__proto__', 'shipped'), { kind: 'unmapped' })
  })
})

import { test } from '@japa/runner'
import { movementActor } from '#transformers/seller/inventory_transformer'

/*
 * T-UI-045 (docs/10 §6.9; R1-S part 2f-iv-b): who made a stock movement, as
 * the stock history names them: by role, never by name.
 */
test.group('T-UI-045 the stock history names people by role', () => {
  const roles = new Map([
    ['u-owner', 'owner'],
    ['u-manager', 'manager'],
    ['u-gone', 'former_member'],
  ])
  const actor = (kind: string, actorUserId: string | null) =>
    movementActor({ kind: kind as never, actorUserId }, roles, 'u-viewer')

  test('T-UI-045 a vendor change names you, the owner, a role or a former member', ({ assert }) => {
    assert.equal(actor('adjustment', 'u-viewer'), 'you')
    assert.equal(actor('adjustment', 'u-owner'), 'owner')
    assert.equal(actor('stocktake', 'u-manager'), 'manager')
    assert.equal(actor('adjustment', 'u-gone'), 'former_member')
    // Anyone outside the shop is DripNepal's staff.
    assert.equal(actor('adjustment', 'u-stranger'), 'staff')
    assert.equal(actor('adjustment', null), 'system')
  })

  test('T-UI-045 an order’s and a repair’s movements name the order and DripNepal', ({
    assert,
  }) => {
    for (const kind of ['reserve', 'release', 'commit', 'ship', 'return_restock', 'rto_restock']) {
      assert.equal(actor(kind, 'u-owner'), 'order', kind)
    }
    assert.equal(actor('correction', 'u-staff'), 'staff')
  })
})

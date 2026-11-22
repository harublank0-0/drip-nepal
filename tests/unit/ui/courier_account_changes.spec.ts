import { test } from '@japa/runner'
import { allowedChanges } from '#shared/ui/courier_account_changes'
import { LOGISTICS_ACCOUNT_STATUSES } from '#modules/logistics/domain/logistics_account_status'

/*
 * T-UI-035, the admin account actions (docs/08 §3.1): the page offers the
 * changes `setLogisticsAccountStatus` allows for each status, and nothing
 * for a disabled account.
 */
const EXPECTED: Record<(typeof LOGISTICS_ACCOUNT_STATUSES)[number], string[]> = {
  pending: ['suspended', 'disabled'],
  active: ['suspended', 'disabled'],
  invalid: ['suspended', 'disabled'],
  suspended: ['pending', 'disabled'],
  disabled: [],
}

test.group('T-UI-035 courier account actions', () => {
  test('T-UI-035 a {status} account offers {changes}')
    .with(
      LOGISTICS_ACCOUNT_STATUSES.map((status) => ({
        status,
        changes: EXPECTED[status].join(', ') || 'nothing',
      }))
    )
    .run(({ assert }, { status }) => {
      assert.deepEqual(allowedChanges(status), EXPECTED[status])
    })
})

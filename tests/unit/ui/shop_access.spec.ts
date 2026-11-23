import { test } from '@japa/runner'
import { SHOP_STATUSES } from '#modules/shops/domain/shop_status'
import { SHOP_MEMBER_ROLES } from '#modules/shops/domain/shop_member_role'
import { memberRoutesOpen } from '#shared/ui/shop_access'

/*
 * T-SEC-031, the `shop.member` rows of docs/07 §4.4, table-driven over every
 * shop status and every actor: `memberRoutesOpen`, the one rule behind the
 * server's gate for `getSellerShop` and the overview and behind the seller
 * UI's links (the header's "Your shop", the shop switcher). Open in `active`
 * and `suspended`; the owner only in `pending_review` and `rejected`; nobody
 * in `closed`.
 */

const ACTORS = ['owner', ...SHOP_MEMBER_ROLES] as const

function expected(status: string, actor: string) {
  if (status === 'active' || status === 'suspended') return true
  if (status === 'closed') return false
  return actor === 'owner'
}

test.group('T-SEC-031 the shop.member gate', () => {
  test('T-SEC-031 {status} for the {actor}')
    .with(SHOP_STATUSES.flatMap((status) => ACTORS.map((actor) => ({ status, actor }))))
    .run(({ assert }, { status, actor }) => {
      assert.equal(memberRoutesOpen(status, actor), expected(status, actor))
    })

  test('T-SEC-031 an unknown status opens nothing', ({ assert }) => {
    assert.isFalse(memberRoutesOpen('archived', 'owner'))
  })
})

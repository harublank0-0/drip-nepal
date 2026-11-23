import { test } from '@japa/runner'
import { SHOP_STATUSES } from '#modules/shops/domain/shop_status'
import { SHOP_MEMBER_ROLES } from '#modules/shops/domain/shop_member_role'
import { memberRoutesOpen, profileEditable } from '#shared/ui/shop_access'

/*
 * T-SEC-031, table-driven over every shop status and every actor:
 * - the `shop.member` rows of docs/07 §4.4: `memberRoutesOpen`, the one rule
 *   behind the server's gate for `getSellerShop`, the overview and the
 *   settings page, and behind the seller UI's links (the header's "Your
 *   shop", the shop switcher). Open in `active` and `suspended`; the owner
 *   only in `pending_review` and `rejected`; nobody in `closed`.
 * - the "profile, shipping" column for `updateShopProfile`:
 *   `profileEditable`, behind the server's gate and the settings page's
 *   choice between the form and the read-only profile (R1-S part 1b). Open
 *   in `active`; the owner only in `pending_review` and `rejected`; nobody
 *   while `suspended`, in either mode, or `closed`.
 */

const ACTORS = ['owner', ...SHOP_MEMBER_ROLES] as const

function expected(status: string, actor: string) {
  if (status === 'active' || status === 'suspended') return true
  if (status === 'closed') return false
  return actor === 'owner'
}

function expectedProfile(status: string, actor: string) {
  if (status === 'active') return true
  if (status === 'pending_review' || status === 'rejected') return actor === 'owner'
  return false
}

const CASES = SHOP_STATUSES.flatMap((status) => ACTORS.map((actor) => ({ status, actor })))

test.group('T-SEC-031 the shop.member gate', () => {
  test('T-SEC-031 {status} for the {actor}')
    .with(CASES)
    .run(({ assert }, { status, actor }) => {
      assert.equal(memberRoutesOpen(status, actor), expected(status, actor))
    })

  test('T-SEC-031 an unknown status opens nothing', ({ assert }) => {
    assert.isFalse(memberRoutesOpen('archived', 'owner'))
  })
})

test.group('T-SEC-031 the profile gate', () => {
  test('T-SEC-031 profile edits: {status} for the {actor}')
    .with(CASES)
    .run(({ assert }, { status, actor }) => {
      assert.equal(profileEditable(status, actor), expectedProfile(status, actor))
    })

  test('T-SEC-031 profile edits: an unknown status allows nothing', ({ assert }) => {
    assert.isFalse(profileEditable('archived', 'owner'))
  })
})

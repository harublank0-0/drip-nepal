import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { signIn, send } from '#tests/support/courier_http'
import { testBrowser } from '#tests/support/browser'
import { addMember, createOwnerShop, GRIEVANCE, setShopStatus } from '#tests/support/shops'
import { CURRENT_SELLER_AGREEMENT } from '#modules/shops/domain/seller_agreements'

/*
 * The seller's shop reads (docs/06 §13.5; R1-S part 1a):
 * - T-SHOP-008: `listMyShops` lists the shops the caller owns and those
 *   they are an `active` member of, by name, with their place in each, and
 *   nothing else (no removed membership, no other shop, no ID); a guest gets
 *   401 and a query parameter 400. `getSellerShop` answers any member with
 *   the profile, the status, the agreement status for the current version
 *   and `version`, repeated as a strong ETag.
 * - T-SEC-034, the table by role: the grievance contact, its phone decrypted,
 *   and the business details of AC-FR-SHOP-013-2 (business type and
 *   identifiers, VAT flag, return policy) reach the owner only; every other
 *   role gets `null` for both (AC-FR-SHOP-013-4).
 * - T-SEC-001 case (a): another shop's slug answers the 404 of an unknown
 *   slug, with the same body.
 * - T-SEC-031, the `shop.member` rows of docs/07 §4.4: owner only while
 *   `pending_review` or `rejected`, open in both suspension modes, refused
 *   when `closed`, with `shop_status` and `suspension_mode`.
 */

const shopPath = (slug: string) => `/api/v1/seller/shops/${slug}`

// A problem body without the members that differ on every request.
function stable(body: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== 'request_id' && key !== 'instance')
  )
}

test.group('T-SHOP-008 listMyShops', () => {
  test('T-SHOP-008 lists owned and active member shops by name, with the caller’s role', async ({
    assert,
  }) => {
    const mine = await createOwnerShop({ name: 'Zeta Pasal' })
    const theirs = await createOwnerShop({ name: 'Alpha Pasal' })
    const removedFrom = await createOwnerShop({ name: 'Beta Pasal' })
    await createOwnerShop({ name: 'Gamma Pasal' })
    await db.table('shop_memberships').insert([
      { shop_id: theirs.shopId, user_id: mine.ownerId, role: 'manager', status: 'active' },
      {
        shop_id: removedFrom.shopId,
        user_id: mine.ownerId,
        role: 'viewer',
        status: 'removed',
        removed_at: new Date(),
      },
    ])
    const browser = await signIn(mine.ownerId)
    const response = await send(browser, 'GET', '/api/v1/seller/shops')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, {
      data: [
        { slug: theirs.slug, name: 'Alpha Pasal', status: 'active', role: 'manager' },
        { slug: mine.slug, name: 'Zeta Pasal', status: 'active', role: 'owner' },
      ],
    })
  })

  test('T-SHOP-008 a user without shops gets an empty list; a guest gets 401', async ({
    assert,
  }) => {
    const user = await UserFactory.create()
    const none = await send(await signIn(user.id), 'GET', '/api/v1/seller/shops')
    assert.equal(none.status, 200)
    assert.deepEqual(none.body, { data: [] })
    const guest = await send(testBrowser(), 'GET', '/api/v1/seller/shops')
    assert.equal(guest.status, 401)
  })

  test('T-SHOP-008 a query parameter is 400 INVALID_QUERY_PARAMETER', async ({ assert }) => {
    const shop = await createOwnerShop()
    const response = await send(await signIn(shop.ownerId), 'GET', '/api/v1/seller/shops?limit=5')
    assert.equal(response.status, 400)
    assert.equal(response.body.code, 'INVALID_QUERY_PARAMETER')
  })
})

test.group('T-SHOP-008 getSellerShop', () => {
  test('T-SHOP-008 the owner gets the profile, the agreement status and the version as ETag', async ({
    assert,
  }) => {
    const shop = await createOwnerShop({ name: 'Owner Pasal' })
    const response = await send(await signIn(shop.ownerId), 'GET', shopPath(shop.slug))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('etag'), '"1"')
    assert.deepEqual(response.body, {
      data: {
        slug: shop.slug,
        name: 'Owner Pasal',
        status: 'active',
        suspension_mode: null,
        description: null,
        contact_email: shop.contactEmail,
        contact_phone: '+97714123456',
        business_details: {
          business_type: 'individual',
          registration_number: null,
          registration_authority: null,
          pan_vat_number: '123456789',
          is_vat_registered: false,
          return_policy_text: 'Returns within 7 days, unworn and with tags.',
        },
        grievance_contact: { name: GRIEVANCE.name, phone: GRIEVANCE.phone },
        agreement: {
          version: CURRENT_SELLER_AGREEMENT.version,
          is_final: CURRENT_SELLER_AGREEMENT.isFinal,
          accepted: true,
        },
        version: 1,
      },
    })
  })

  test('T-SEC-034 a {role} gets no grievance contact and no business details [AC-FR-SHOP-013-4]')
    .with([
      { role: 'manager' },
      { role: 'catalog_editor' },
      { role: 'order_fulfiller' },
      { role: 'viewer' },
    ])
    .run(async ({ assert }, { role }) => {
      const shop = await createOwnerShop()
      const memberId = await addMember(shop.shopId, role)
      const response = await send(await signIn(memberId), 'GET', shopPath(shop.slug))
      assert.equal(response.status, 200)
      assert.isNull(response.body.data.grievance_contact)
      assert.isNull(response.body.data.business_details)
      for (const member of ['business_type', 'is_vat_registered', 'return_policy_text']) {
        assert.notProperty(response.body.data, member)
      }
      for (const value of [
        GRIEVANCE.name,
        GRIEVANCE.phone,
        '123456789',
        'individual',
        'Returns within',
      ]) {
        assert.notInclude(response.text, value)
      }
      assert.equal(response.body.data.slug, shop.slug)
    })

  test('T-SEC-001 another shop’s slug answers the 404 of an unknown slug', async ({ assert }) => {
    const mine = await createOwnerShop()
    const theirs = await createOwnerShop()
    const browser = await signIn(mine.ownerId)
    const unknown = await send(browser, 'GET', shopPath('no-such-shop-anywhere'))
    assert.equal(unknown.status, 404)
    const other = await send(browser, 'GET', shopPath(theirs.slug))
    assert.equal(other.status, 404)
    assert.deepEqual(stable(other.body), stable(unknown.body))
  })

  test('T-SEC-031 shop.member gate: {status} for the {actor}')
    .with([
      { status: 'pending_review' as const, mode: null, actor: 'owner', expected: 200 },
      { status: 'rejected' as const, mode: null, actor: 'owner', expected: 200 },
      { status: 'pending_review' as const, mode: null, actor: 'manager', expected: 403 },
      { status: 'rejected' as const, mode: null, actor: 'viewer', expected: 403 },
      {
        status: 'suspended' as const,
        mode: 'fulfill_existing' as const,
        actor: 'viewer',
        expected: 200,
      },
      { status: 'suspended' as const, mode: 'frozen' as const, actor: 'owner', expected: 200 },
      { status: 'closed' as const, mode: null, actor: 'owner', expected: 403 },
    ])
    .run(async ({ assert }, { status, mode, actor, expected }) => {
      const shop = await createOwnerShop()
      const userId = actor === 'owner' ? shop.ownerId : await addMember(shop.shopId, actor)
      await setShopStatus(shop.shopId, status, mode)
      const response = await send(await signIn(userId), 'GET', shopPath(shop.slug))
      assert.equal(response.status, expected)
      if (expected === 403) {
        assert.equal(response.body.code, 'SHOP_NOT_ACTIVE')
        assert.equal(response.body.shop_status, status)
      } else {
        assert.equal(response.body.data.status, status)
        assert.equal(response.body.data.suspension_mode, mode)
      }
    })
})

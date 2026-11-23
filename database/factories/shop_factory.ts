import { randomBytes, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import factory from '@adonisjs/lucid/factories'
import Shop from '#models/shop'
import type { BusinessType } from '#modules/shops/domain/business_type'
import { CURRENT_SELLER_AGREEMENT } from '#modules/shops/domain/seller_agreements'
import type { ShopStatus } from '#modules/shops/domain/shop_status'
import { UserFactory } from '#database/factories/user_factory'
import { placeholderCiphertext } from '#database/factories/placeholder_ciphertext'

/*
 * Shops (docs/04a §6.1) for tests and development seeders (docs/04 §20.3).
 * The default is a `pending_review` application of an individual, owned by
 * a new user unless the caller merges `ownerUserId`.
 *
 * State `active` creates the aggregate whole: the shop is inserted
 * `pending_review`, then its `shop_agreements` row (docs/04a §6.4), then it
 * is approved and activated, because the `shops_require_agreement` trigger
 * (INV-18) refuses an active shop without an agreement. The approver is the
 * user the caller merged as `approvedBy`, or else a new user; no staff
 * factory exists yet.
 */

/** The current seller agreement version of the registry (04a §6.4), as the owner's shop accepts it. */
export const FACTORY_AGREEMENT_VERSION = CURRENT_SELLER_AGREEMENT.version

const status = (value: ShopStatus) => value
const businessType = (value: BusinessType) => value

// Shops the `active` state applied to, activated after insert.
const toActivate = new WeakSet<Shop>()

let sequence = 0

export const ShopFactory = factory
  .define(Shop, ({ faker }) => {
    sequence += 1
    const suffix = faker.string.alphanumeric({ length: 6, casing: 'lower' })
    return {
      name: `Thulo Pasal ${sequence}`,
      slug: `shop-${sequence}-${suffix}`,
      status: status('pending_review'),
      contactEmail: `shop-${sequence}-${suffix}@example.com`,
      contactPhoneE164: `+97798${faker.string.numeric(8)}`,
      returnPolicyText: 'Returns within 7 days, unworn and with tags.',
      businessType: businessType('individual'),
      grievanceContactName: faker.person.fullName().slice(0, 100),
      grievanceContactPhoneEnc: placeholderCiphertext(),
    }
  })
  .state('active', (shop) => {
    toActivate.add(shop)
  })
  .before('create', async (_, shop, ctx) => {
    if (!shop.ownerUserId) {
      const owner = await UserFactory.useCtx(ctx).create()
      shop.ownerUserId = owner.id
    }
  })
  .after('create', async (_, shop, ctx) => {
    if (!toActivate.has(shop)) return
    await ctx
      .$trx!.insertQuery()
      .table('shop_agreements')
      .insert({
        shop_id: shop.id,
        agreement_version: FACTORY_AGREEMENT_VERSION,
        accepted_by_user_id: shop.ownerUserId,
        ip_hash: randomBytes(32),
        request_id: randomUUID(),
      })
    let approvedBy = shop.approvedBy
    if (!approvedBy) {
      const approver = await UserFactory.useCtx(ctx).create()
      approvedBy = approver.id
    }
    shop.merge({ status: status('active'), approvedAt: DateTime.now(), approvedBy })
    await shop.save()
  })
  .build()

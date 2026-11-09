import { ShopSchema } from '#database/schema'
import { belongsTo, hasMany, hasOne, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne, ManyToMany } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import District from './district.js'
import DeliveryZone from './delivery_zone.js'
import LogisticsAccount from './logistics_account.js'
import ShopLogisticsSetting from './shop_logistics_setting.js'
import ShopMembership from './shop_membership.js'
import ShopInvitation from './shop_invitation.js'
import ShopAgreement from './shop_agreement.js'
import ShopReviewDecision from './shop_review_decision.js'
import ShopAddress from './shop_address.js'
import ShopPayoutAccount from './shop_payout_account.js'
import ShopCategory from './shop_category.js'

/*
 * docs/04a §6.1 (shops), the tenant root. Relations point downward only
 * (docs/09 §2.2, §3.10): to identity and logistics models and to the shops
 * module's own tables. The logo and banner are `media_assets` rows, a higher
 * module, so they have no relation here.
 *
 * The composite-key tables (docs/04 §2.15) have no model of their own: they
 * are read through the `manyToMany` relations below and written with the
 * query builder or the pivot helpers. `logistics_account_shops` (§9.10) is
 * composite too (04 §2.15).
 */
export default class Shop extends ShopSchema {
  @belongsTo(() => User, { foreignKey: 'ownerUserId' })
  declare owner: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'approvedBy' })
  declare approvedByUser: BelongsTo<typeof User>

  @hasMany(() => ShopMembership)
  declare memberships: HasMany<typeof ShopMembership>

  @hasMany(() => ShopInvitation)
  declare invitations: HasMany<typeof ShopInvitation>

  @hasMany(() => ShopAgreement)
  declare agreements: HasMany<typeof ShopAgreement>

  @hasMany(() => ShopReviewDecision)
  declare reviewDecisions: HasMany<typeof ShopReviewDecision>

  @hasMany(() => ShopAddress)
  declare addresses: HasMany<typeof ShopAddress>

  @hasMany(() => ShopPayoutAccount)
  declare payoutAccounts: HasMany<typeof ShopPayoutAccount>

  // docs/04a §6.9
  @manyToMany(() => ShopCategory, {
    pivotTable: 'shop_category_assignments',
    pivotForeignKey: 'shop_id',
    relatedKey: 'code',
    pivotRelatedForeignKey: 'shop_category_code',
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare categories: ManyToMany<typeof ShopCategory>

  // docs/04a §9.6
  @manyToMany(() => District, {
    pivotTable: 'shop_delivery_coverage',
    pivotForeignKey: 'shop_id',
    relatedKey: 'code',
    pivotRelatedForeignKey: 'district_code',
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare deliveryDistricts: ManyToMany<typeof District>

  // docs/04a §9.7
  @manyToMany(() => DeliveryZone, {
    pivotTable: 'shop_shipping_rates',
    pivotForeignKey: 'shop_id',
    relatedKey: 'code',
    pivotRelatedForeignKey: 'zone_code',
    pivotColumns: ['fee_minor', 'currency', 'est_min_days', 'est_max_days'],
    pivotTimestamps: true,
  })
  declare shippingZones: ManyToMany<typeof DeliveryZone>

  // docs/04a §9.9: the courier accounts this shop owns
  @hasMany(() => LogisticsAccount)
  declare logisticsAccounts: HasMany<typeof LogisticsAccount>

  // docs/04a §9.10: every account the shop may book through, its own and
  // platform-owned ones
  @manyToMany(() => LogisticsAccount, {
    pivotTable: 'logistics_account_shops',
    pivotForeignKey: 'shop_id',
    pivotRelatedForeignKey: 'account_id',
    pivotColumns: ['account_owner_type', 'owner_shop_id', 'is_active', 'enabled_at', 'disabled_at'],
    pivotTimestamps: true,
  })
  declare bookableLogisticsAccounts: ManyToMany<typeof LogisticsAccount>

  // docs/04a §9.11: no row means `manual` with is_enabled true
  @hasOne(() => ShopLogisticsSetting)
  declare logisticsSettings: HasOne<typeof ShopLogisticsSetting>
}

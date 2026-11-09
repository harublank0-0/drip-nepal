import { RefundSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'
import Payment from './payment.js'
import ProviderEvent from './provider_event.js'
import LedgerEntry from './ledger_entry.js'

/*
 * docs/04a §12.4 (payments). The shop order, return request and order lines
 * belong to `orders`, a higher module (docs/09 §2.2), so this model does not
 * relate to them; `ShopOrder.refunds` reads the other way. `refund_items`
 * (§12.5) is a composite-key table (docs/04 §2.15) with no model.
 * `ledger_entries` belongs to `ledger`, which `payments` may use.
 */
export default class Refund extends RefundSchema {
  @belongsTo(() => Payment)
  declare payment: BelongsTo<typeof Payment>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  // the cancelled refund this one replaces (proposed, docs/05 §8.8)
  @belongsTo(() => Refund, { foreignKey: 'replacesRefundId' })
  declare replacesRefund: BelongsTo<typeof Refund>

  // null for system refunds
  @belongsTo(() => User, { foreignKey: 'createdBy' })
  declare createdByUser: BelongsTo<typeof User>

  // a platform staff member (`platform_staff.user_id`)
  @belongsTo(() => User, { foreignKey: 'approvedBy' })
  declare approvedByUser: BelongsTo<typeof User>

  @hasMany(() => ProviderEvent)
  declare providerEvents: HasMany<typeof ProviderEvent>

  @hasMany(() => LedgerEntry)
  declare ledgerEntries: HasMany<typeof LedgerEntry>
}

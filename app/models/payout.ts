import { PayoutSchema } from '#database/schema'
import { belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import PlatformStaff from './platform_staff.js'
import ShopPayoutAccount from './shop_payout_account.js'
import LedgerEntry from './ledger_entry.js'

/*
 * docs/04a §13.2 (ledger). `Shop` and `ShopPayoutAccount` sit lower
 * (docs/09 §2.2) and do not relate back. `payout_entries` (§13.3) is a
 * composite-key table (docs/04 §2.15) with no model of its own: it is read
 * through `settledEntries` and written with the query builder in the owning
 * action.
 */
export default class Payout extends PayoutSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => ShopPayoutAccount, { foreignKey: 'payoutAccountId' })
  declare payoutAccount: BelongsTo<typeof ShopPayoutAccount>

  // platform staff members (`platform_staff.user_id`)
  @belongsTo(() => PlatformStaff, { foreignKey: 'createdBy' })
  declare createdByStaff: BelongsTo<typeof PlatformStaff>

  @belongsTo(() => PlatformStaff, { foreignKey: 'approvedBy' })
  declare approvedByStaff: BelongsTo<typeof PlatformStaff>

  // docs/04a §13.3: the entries this payout settles
  @manyToMany(() => LedgerEntry, {
    pivotTable: 'payout_entries',
    pivotForeignKey: 'payout_id',
    pivotRelatedForeignKey: 'ledger_entry_id',
    pivotColumns: ['shop_id'],
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare settledEntries: ManyToMany<typeof LedgerEntry>

  // the `payout`, `payout_reversal` and `tax_withholding` entries it posts
  @hasMany(() => LedgerEntry)
  declare ledgerEntries: HasMany<typeof LedgerEntry>
}

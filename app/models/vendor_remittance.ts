import { VendorRemittanceSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import PlatformStaff from './platform_staff.js'
import LedgerEntry from './ledger_entry.js'

/* docs/04a §13.4 (ledger). Insert-only in practice. */
export default class VendorRemittance extends VendorRemittanceSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  // a platform staff member (`platform_staff.user_id`)
  @belongsTo(() => PlatformStaff, { foreignKey: 'recordedBy' })
  declare recordedByStaff: BelongsTo<typeof PlatformStaff>

  // its `vendor_remittance` entry
  @hasMany(() => LedgerEntry, { foreignKey: 'remittanceId' })
  declare ledgerEntries: HasMany<typeof LedgerEntry>
}

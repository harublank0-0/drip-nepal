import { LedgerEntrySchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'
import Payout from './payout.js'
import VendorRemittance from './vendor_remittance.js'

/*
 * docs/04a §13.1 (ledger). Append-only (docs/04 §2.12): inserted, never
 * saved again. The shop order, order item and refund an entry is about
 * belong to `orders` and `payments`, higher modules (docs/09 §2.2), so this
 * model does not relate to them; `Refund.ledgerEntries` reads the other way.
 */
export default class LedgerEntry extends LedgerEntrySchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => Payout)
  declare payout: BelongsTo<typeof Payout>

  @belongsTo(() => VendorRemittance, { foreignKey: 'remittanceId' })
  declare remittance: BelongsTo<typeof VendorRemittance>

  @belongsTo(() => LedgerEntry, { foreignKey: 'reversesEntryId' })
  declare reversesEntry: BelongsTo<typeof LedgerEntry>

  // staff for adjustments and remittances; null for system postings
  @belongsTo(() => User, { foreignKey: 'createdBy' })
  declare createdByUser: BelongsTo<typeof User>
}

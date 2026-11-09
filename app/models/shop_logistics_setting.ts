import { ShopLogisticsSettingSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LogisticsAccount from './logistics_account.js'

/*
 * docs/04a §9.11 (logistics, OD-56), keyed by `shop_id`. The shop is read
 * from the `Shop` side (docs/09 §2.2).
 */
export default class ShopLogisticsSetting extends ShopLogisticsSettingSchema {
  @belongsTo(() => LogisticsAccount, { foreignKey: 'defaultAccountId' })
  declare defaultAccount: BelongsTo<typeof LogisticsAccount>
}

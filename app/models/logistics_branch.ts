import { LogisticsBranchSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LogisticsProvider from './logistics_provider.js'

/*
 * docs/04a §9.12 (logistics, M6): a courier branch, written only by the
 * `logistics.sync_branches` job and the staff district mapping.
 */
export default class LogisticsBranch extends LogisticsBranchSchema {
  @belongsTo(() => LogisticsProvider, { foreignKey: 'providerCode', localKey: 'code' })
  declare provider: BelongsTo<typeof LogisticsProvider>
}

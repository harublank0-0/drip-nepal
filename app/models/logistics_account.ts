import { LogisticsAccountSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LogisticsProvider from './logistics_provider.js'

/*
 * docs/04a §9.9 (logistics, OD-56). `logistics` sits below `shops`
 * (docs/09 §2.2), so the owning shop and the shops allowed to book (§9.10)
 * are read from the `Shop` side. `credentials_enc` is Secret and never
 * serialises.
 */
export default class LogisticsAccount extends LogisticsAccountSchema {
  @belongsTo(() => LogisticsProvider, { foreignKey: 'providerCode', localKey: 'code' })
  declare provider: BelongsTo<typeof LogisticsProvider>
}

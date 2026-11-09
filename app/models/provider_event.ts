import { ProviderEventSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Payment from './payment.js'
import Refund from './refund.js'

/*
 * docs/04a §12.3 (payments). `payload` is redacted and read through the
 * module's typed parser (docs/04 §2.11).
 */
export default class ProviderEvent extends ProviderEventSchema {
  @belongsTo(() => Payment)
  declare payment: BelongsTo<typeof Payment>

  @belongsTo(() => Refund)
  declare refund: BelongsTo<typeof Refund>
}

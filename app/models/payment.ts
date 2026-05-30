import { PaymentSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import Order from './order.ts'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class Payment extends PaymentSchema {
  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>
}

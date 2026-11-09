import { PaymentSchema } from '#database/schema'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Refund from './refund.js'
import ProviderEvent from './provider_event.js'

/*
 * docs/04a §12.1 (payments). The order and shop order it pays belong to
 * `orders`, a higher module (docs/09 §2.2), so this model does not relate to
 * them; `Order.payments` reads the other way. `payment_allocations` (§12.2)
 * is a composite-key table (docs/04 §2.15) with no model: it is written with
 * the query builder in the owning action.
 */
export default class Payment extends PaymentSchema {
  @hasMany(() => Refund)
  declare refunds: HasMany<typeof Refund>

  @hasMany(() => ProviderEvent)
  declare providerEvents: HasMany<typeof ProviderEvent>
}

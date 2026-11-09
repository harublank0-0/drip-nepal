import { AttributeValueSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Attribute from './attribute.js'

/* docs/04a §7.3 (catalog). Reference data; deactivated, never deleted. */
export default class AttributeValue extends AttributeValueSchema {
  @belongsTo(() => Attribute)
  declare attribute: BelongsTo<typeof Attribute>
}

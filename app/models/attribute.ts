import { AttributeSchema } from '#database/schema'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import AttributeValue from './attribute_value.js'

/* docs/04a §7.2 (catalog). Reference data; `code` is immutable. */
export default class Attribute extends AttributeSchema {
  @hasMany(() => AttributeValue)
  declare values: HasMany<typeof AttributeValue>
}

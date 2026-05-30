import { AttributeSchema } from '#database/schema'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'

export default class Attribute extends AttributeSchema {
  @hasMany(() => Attribute)
  declare attributes: HasMany<typeof Attribute>
}


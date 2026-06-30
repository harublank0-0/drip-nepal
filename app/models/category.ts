import { CategorySchema } from '#database/schema'
import { hasMany } from '@adonisjs/lucid/orm'
import Product from './product.js'
import type { HasMany } from '@adonisjs/lucid/types/relations'

export default class Category extends CategorySchema {
  @hasMany(() => Product)
  declare products: HasMany<typeof Product>
}

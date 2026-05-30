import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cart_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('cart_id').notNullable().index()
      table.foreign('cart_id').references('carts.id').onDelete('CASCADE')

      table.uuid('product_variant_id').notNullable().index()
      table.foreign('product_variant_id').references('product_variants.id').onDelete('CASCADE')

      table.integer('quantity', 10).notNullable().defaultTo(1)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['cart_id', 'product_variant_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

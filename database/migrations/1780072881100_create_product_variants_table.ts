import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'product_variants'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('product_id').notNullable()
      table.foreign('product_id').references('products.id').onDelete('CASCADE')

      table.string('sku', 100).notNullable().unique()

      table.decimal('price', 10, 2).notNullable()

      table.decimal('compare_price', 10, 2).nullable()

      table.integer('quantity').notNullable()

      table.string('status').notNullable().defaultTo('active')

      table.decimal('weight', 10, 2).nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

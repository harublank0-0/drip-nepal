import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'order_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('order_id').notNullable().index()
      table.foreign('order_id').references('orders.id').onDelete('CASCADE')

      table.uuid('shop_id').notNullable().index()
      table.foreign('shop_id').references('shops.id').onDelete('CASCADE')

      table.uuid('product_id').notNullable().index()
      table.foreign('product_id').references('products.id').onDelete('CASCADE')

      table.uuid('product_variant_id').nullable().index()
      table.foreign('product_variant_id').references('product_variants.id').onDelete('CASCADE')

      table.string('product_name_snapshot', 100).notNullable()

      table.string('product_variant_snapshot', 100).nullable()

      table.string('sku_snapshot', 100).nullable()

      table.decimal('unit_price', 10, 2).notNullable()

      table.integer('quantity', 10).notNullable()

      table.decimal('sub_total', 10, 2).notNullable()

      table.timestamp('created_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

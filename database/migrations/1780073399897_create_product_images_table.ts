import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'product_images'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('product_id').notNullable()
      table.foreign('product_id').references('products.id').onDelete('CASCADE')

      table.uuid('variant_id').nullable()
      table.foreign('variant_id').references('product_variants.id').onDelete('CASCADE')

      table.string('image_url', 255).notNullable()

      table.string('alt', 100).nullable()

      table.string('sort_order').nullable()

      table.timestamp('created_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

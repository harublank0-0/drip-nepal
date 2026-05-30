import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'product_variant_attribute_values'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('product_variant_id').notNullable().index()
      table.foreign('product_variant_id').references('product_variants.id').onDelete('CASCADE')

      table.uuid('attribute_value_id').notNullable().index()
      table.foreign('attribute_value_id').references('attribute_values.id').onDelete('CASCADE')

      table.unique(['product_variant_id', 'attribute_value_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

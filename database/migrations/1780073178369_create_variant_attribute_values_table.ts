import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'variant_attribute_values'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('variant_id').notNullable()
      table.foreign('variant_id').references('product_variants.id').onDelete('CASCADE')

      table.uuid('attribute_value_id').notNullable()
      table.foreign('attribute_value_id').references('attribute_values.id').onDelete('CASCADE')

      table.index(['variant_id', 'attribute_value_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

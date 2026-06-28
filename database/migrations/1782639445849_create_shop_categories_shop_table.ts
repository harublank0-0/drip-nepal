import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'shop_categories_shop'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('shop_id').notNullable().index()
      table.foreign('shop_id').references('shops.id').onDelete('CASCADE')

      table.string('shop_category_id').notNullable().index()
      table.foreign('shop_category_id').references('shop_categories.id').onDelete('CASCADE')

      table.unique(['shop_id', 'shop_category_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

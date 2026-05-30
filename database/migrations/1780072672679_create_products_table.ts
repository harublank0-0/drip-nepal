import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('shop_id').notNullable().index()
      table.foreign('shop_id').references('shops.id').onDelete('CASCADE')

      table.uuid('category_id').notNullable().index()
      table.foreign('category_id').references('categories.id').onDelete('CASCADE')

      table.string('name', 100).notNullable().unique()

      table.string('slug', 100).notNullable().unique()

      table.string('description', 255).nullable()

      table.string('status').notNullable().defaultTo('active')

      table.string('brand', 100).nullable()

      table.boolean('is_featured').notNullable().defaultTo(false)

      table.string('published_at').nullable()

      table.timestamp('created_at').notNullable()

      table.timestamp('updated_at').nullable()

      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

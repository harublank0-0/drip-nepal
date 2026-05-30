import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'shop_roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('shop_id').notNullable().index()
      table.foreign('shop_id').references('shops.id').onDelete('CASCADE')

      table.string('name', 100).notNullable()

      table.string('slug', 100).notNullable()

      table.timestamp('created_at').notNullable()

      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

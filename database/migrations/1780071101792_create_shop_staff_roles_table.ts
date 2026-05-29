import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'shop_staff_roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('shop_id').notNullable()
      table.foreign('shop_id').references('shops.id').onDelete('CASCADE')

      table.uuid('user_id').notNullable()
      table.foreign('user_id').references('users.id').onDelete('CASCADE')

      table.uuid('shop_role_id').notNullable()
      table.foreign('shop_role_id').references('shop_roles.id').onDelete('CASCADE')

      table.timestamp('joined_at').notNullable().defaultTo(this.raw('now()'))
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

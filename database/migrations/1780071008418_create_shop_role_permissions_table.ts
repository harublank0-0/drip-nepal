import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'shop_role_permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('shop_role_id').notNullable()
      table.foreign('shop_role_id').references('shop_roles.id').onDelete('CASCADE')

      table.uuid('permission_id').notNullable()
      table.foreign('permission_id').references('permissions.id').onDelete('CASCADE')

      table.index(['shop_role_id', 'permission_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

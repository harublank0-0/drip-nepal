import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'global_role_permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('global_role_id').notNullable()
      table.foreign('global_role_id').references('global_roles.id').onDelete('CASCADE')

      table.uuid('permission_id').notNullable()
      table.foreign('permission_id').references('permissions.id').onDelete('CASCADE')

      table.unique(['global_role_id', 'permission_id'])

      table.timestamp('created_at').notNullable()

      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

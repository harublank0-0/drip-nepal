import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'global_user_roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('user_id').notNullable()
      table.foreign('user_id').references('users.id').onDelete('CASCADE')

      table.uuid('global_role_id').notNullable()
      table.foreign('global_role_id').references('global_roles.id').onDelete('CASCADE')

      table.unique(['user_id', 'global_role_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

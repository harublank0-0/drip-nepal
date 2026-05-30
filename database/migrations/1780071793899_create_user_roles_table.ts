import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('user_id').notNullable()
      table.foreign('user_id').references('users.id').onDelete('CASCADE')

      table.uuid('role_id').notNullable()
      table.foreign('role_id').references('roles.id').onDelete('CASCADE')

      table.unique(['user_id', 'role_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

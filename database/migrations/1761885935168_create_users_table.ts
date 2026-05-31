import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.string('full_name', 100).notNullable()

      table.string('username', 100).nullable().unique()

      table.string('email', 100).nullable().unique()

      table.string('password').nullable().comment('nullable for OAuth')

      table.string('phone', 15).nullable().unique()

      table.string('avatar').nullable()

      table
        .string('status', 30)
        .notNullable()
        .defaultTo('pending_verification')
        .comment('active, suspended, deleted, pending_verification,etc')

      table.timestamp('email_verified_at').nullable()

      table.timestamp('last_login_at').nullable()

      table.timestamp('deleted_at').nullable().comment('soft delete')

      table.timestamp('created_at').notNullable()

      table.timestamp('updated_at').nullable()

      table.index(['status', 'email'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

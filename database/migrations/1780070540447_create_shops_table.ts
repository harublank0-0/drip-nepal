import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'shops'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('owner_id').notNullable()
      table.foreign('owner_id').references('users.id')

      table.string('name', 100).notNullable().unique()

      table.string('slug', 100).notNullable().unique()

      table.string('description', 500).nullable()

      table.string('logo').nullable()

      table.string('banner').nullable()

      table.string('email', 100).nullable().unique()

      table.string('phone', 15).nullable().unique()

      table
        .string('status', 30)
        .notNullable()
        .defaultTo('pending')
        .comment('active, suspended, deleted, pending, rejected, etc')

      table.timestamp('verified_at').nullable()

      table.timestamp('created_at').notNullable()

      table.timestamp('updated_at').nullable()

      table.timestamp('deleted_at').nullable().comment('soft delete')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

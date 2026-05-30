import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_addresses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('user_id').notNullable()
      table.foreign('user_id').references('users.id').onDelete('CASCADE')

      table.string('label', 50).nullable()

      table.string('recipient_name').notNullable()

      table.string('recipient_phone', 15).nullable().unique()

      table.string('country').notNullable().defaultTo('nepal')

      table.string('province', 50).notNullable()

      table.string('district', 50).notNullable()

      table.string('city', 50).notNullable()

      table.string('area', 50).nullable()

      table.string('street_address', 200).notNullable()

      table.string('municipality', 50).nullable()

      table.string('postal_code', 10).nullable()

      table.boolean('is_default').notNullable().defaultTo(false)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

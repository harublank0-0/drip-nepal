import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.string('parent_id').nullable()

      table.string('name', 100).notNullable().unique()

      table.string('slug', 100).notNullable().unique()

      table.string('description', 255).nullable()

      table.boolean('is_active').notNullable().defaultTo(true)

      table.string('image').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

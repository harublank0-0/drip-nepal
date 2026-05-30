import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'orders'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('user_id').notNullable().index()
      table.foreign('user_id').references('users.id').onDelete('CASCADE')

      table.uuid('user_address_id').nullable()
      table.foreign('user_address_id').references('user_addresses.id').onDelete('CASCADE')

      table.string('order_number', 100).notNullable().unique()

      table
        .string('status')
        .notNullable()
        .defaultTo('pending')
        .comment('pending, confirmed, processing, shipped, delivered, cancelled')

      table
        .string('payment_status')
        .notNullable()
        .defaultTo('pending')
        .comment('pending, paid, failed, refunded')

      table.decimal('subtotal', 10, 2).notNullable()

      table.decimal('discount_total', 10, 2).notNullable().defaultTo(0)

      table.decimal('shipping_total', 10, 2).notNullable().defaultTo(0)

      table.decimal('grand_total', 10, 2).notNullable()

      table.string('notes', 500).nullable()

      table.timestamp('placed_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

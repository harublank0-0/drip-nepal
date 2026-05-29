import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('order_id').notNullable()
      table.foreign('order_id').references('orders.id').onDelete('CASCADE')

      table.string('provider').notNullable().comment('cod, eSewa, khalti')

      table.string('transaction_reference').nullable()

      table.string('status').notNullable().comment('pending, paid, failed, refunded')

      table.decimal('amount', 10, 2).notNullable()

      table.string('paid_at').nullable()

      table.timestamp('created_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

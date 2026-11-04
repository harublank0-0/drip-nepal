import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Guest checkout. A guest's order has no user; the name and phone live in
 * its shipping address snapshot. A guest's cart is found by the random
 * token kept in their session (`carts.session_id`).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw('ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL')
    this.schema.alterTable('carts', (table) => {
      table.index(['session_id'])
    })
  }

  async down() {
    // Fails while guest orders exist: they have nobody to belong to.
    this.schema.raw('ALTER TABLE orders ALTER COLUMN user_id SET NOT NULL')
    this.schema.alterTable('carts', (table) => {
      table.dropIndex(['session_id'])
    })
  }
}

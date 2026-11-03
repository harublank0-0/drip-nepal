import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Fixes the first schema draft so it works for a marketplace:
 *
 * - Product names were unique across all shops; only the slug needs to be.
 * - Product descriptions were capped at 255 characters.
 * - Products get a `gender` (men / women / unisex) for the storefront split.
 * - Attribute values (sizes, colors) are unique per attribute, not globally.
 * - Media sort order becomes a number.
 * - Checkout creates one order per shop: orders get `shop_id`, a
 *   `checkout_id` grouping the orders of one checkout, and a snapshot of the
 *   shipping address so later address edits don't change past orders.
 *   Deleting a saved address no longer deletes the orders that used it.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('products', (table) => {
      table.dropUnique(['name'])
      table.text('description').nullable().alter()
      table.string('gender', 20).notNullable().defaultTo('unisex').index()
      table.index(['status'])
    })

    this.schema.alterTable('attribute_values', (table) => {
      table.dropUnique(['value'])
      table.dropUnique(['slug'])
      table.unique(['attribute_id', 'value'])
      table.unique(['attribute_id', 'slug'])
    })

    this.schema.raw(
      "ALTER TABLE product_media ALTER COLUMN sort_order TYPE integer USING NULLIF(sort_order, '')::integer"
    )

    this.schema.alterTable('orders', (table) => {
      table.uuid('shop_id').nullable().index()
      table.foreign('shop_id').references('shops.id').onDelete('SET NULL')
      table.uuid('checkout_id').nullable().index()
      table.jsonb('shipping_address').nullable()
      table.dropForeign(['user_address_id'])
      table.foreign('user_address_id').references('user_addresses.id').onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable('orders', (table) => {
      table.dropForeign(['user_address_id'])
      table.foreign('user_address_id').references('user_addresses.id').onDelete('CASCADE')
      table.dropForeign(['shop_id'])
      table.dropColumn('shop_id')
      table.dropColumn('checkout_id')
      table.dropColumn('shipping_address')
    })

    this.schema.raw('ALTER TABLE product_media ALTER COLUMN sort_order TYPE varchar(255)')

    this.schema.alterTable('attribute_values', (table) => {
      table.dropUnique(['attribute_id', 'value'])
      table.dropUnique(['attribute_id', 'slug'])
      table.unique(['value'])
      table.unique(['slug'])
    })

    this.schema.alterTable('products', (table) => {
      table.dropIndex(['status'])
      table.dropColumn('gender')
      table.string('description', 255).nullable().alter()
      table.unique(['name'])
    })
  }
}

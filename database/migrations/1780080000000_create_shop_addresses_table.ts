import { BaseSchema } from '@adonisjs/lucid/schema'
import { ShopAddressTypes } from '#constants/shop_address_type'

export default class extends BaseSchema {
  protected tableName = 'shop_addresses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.uuid('shop_id').notNullable().index()
      table.foreign('shop_id').references('shops.id').onDelete('CASCADE')

      table.string('label', 50).nullable()

      table.string('address', 500).notNullable()

      table.string('city', 100).notNullable()

      table.string('district', 100).notNullable()

      table.string('province', 100).notNullable()

      table.string('type', 20).notNullable().defaultTo(ShopAddressTypes.PRIMARY)

      table.boolean('is_default').notNullable().defaultTo(false)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
